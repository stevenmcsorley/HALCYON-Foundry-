"""ML feedback logging and statistics."""
import asyncpg
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from .db import get_pool
from .ml_weights import apply_online_update
from .metrics import (
    ml_suggestion_feedback_total,
    ml_online_update_total,
    ml_suggestion_calibration
)
import logging

logger = logging.getLogger(__name__)


async def record_feedback(
    case_id: int,
    suggestion_type: str,
    suggested_value: str,
    final_value: Optional[str],
    action: str,
    score: Optional[float],
    user_id: Optional[str],
    conn: Optional[asyncpg.Connection] = None
) -> Dict[str, Any]:
    """
    Record feedback event and trigger online learning updates.
    
    Args:
        case_id: Case ID
        suggestion_type: 'priority' or 'owner'
        suggested_value: The suggested value
        final_value: The final value (if adopted/overridden), None if rejected
        action: 'accepted', 'rejected', or 'overridden'
        score: Confidence score shown to user
        user_id: User ID from token
        conn: Optional connection (for transactions)
    
    Returns:
        Dict with feedback record
    """
    pool = await get_pool()
    should_close = conn is None
    
    if conn is None:
        conn = await pool.acquire()
    
    try:
        # Insert feedback log
        row = await conn.fetchrow(
            """
            INSERT INTO ml_feedback_log
            (case_id, suggestion_type, suggested_value, final_value, action, score, user_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, created_at
            """,
            case_id, suggestion_type, suggested_value, final_value, action, score, user_id
        )
        
        # Record metrics
        ml_suggestion_feedback_total.labels(type=suggestion_type, action=action).inc()
        
        if score is not None:
            # Record calibration: track (score, accepted) pairs
            accepted = 1.0 if action == 'accepted' else 0.0
            ml_suggestion_calibration.observe(score, accepted)
        
        # Compute reward and update weights
        reward = _compute_reward(action, suggestion_type, suggested_value, final_value)
        
        if reward != 0:
            # Determine which features to update
            features = _get_features_for_update(suggestion_type, suggested_value, final_value)
            for feature in features:
                await apply_online_update(feature, reward)
                ml_online_update_total.labels(feature=feature).inc()
                logger.debug(
                    f"Updated weight: feature={feature}, reward={reward}, "
                    f"case_id={case_id}, action={action}"
                )
        
        logger.info(
            f"Feedback recorded: case_id={case_id}, type={suggestion_type}, "
            f"action={action}, reward={reward}"
        )
        
        return {
            "id": row["id"],
            "case_id": case_id,
            "suggestion_type": suggestion_type,
            "suggested_value": suggested_value,
            "final_value": final_value,
            "action": action,
            "score": score,
            "user_id": user_id,
            "created_at": row["created_at"]
        }
    finally:
        if should_close:
            await pool.release(conn)


def _compute_reward(
    action: str,
    suggestion_type: str,
    suggested_value: str,
    final_value: Optional[str]
) -> float:
    """
    Compute reward for online learning.
    
    Returns:
        +1.0 for accepted
        -1.0 for rejected
        +0.5 for overridden if final matches nearby rank (soft accept)
        -0.5 for overridden if final doesn't match
    """
    if action == 'accepted':
        return 1.0
    elif action == 'rejected':
        return -1.0
    elif action == 'overridden':
        if suggestion_type == 'priority':
            # Check if final is "nearby" to suggested
            priority_ranks = ['low', 'medium', 'high', 'critical']
            try:
                suggested_idx = priority_ranks.index(suggested_value.lower())
                final_idx = priority_ranks.index(final_value.lower()) if final_value else -1
                if abs(suggested_idx - final_idx) <= 1:
                    return 0.5  # Soft accept
            except (ValueError, AttributeError):
                pass
        # For owner or non-nearby priority, treat as negative
        return -0.5
    return 0.0


def _get_features_for_update(
    suggestion_type: str,
    suggested_value: str,
    final_value: Optional[str]
) -> List[str]:
    """Get list of features to update based on suggestion type and values."""
    features = []
    
    if suggestion_type == 'priority':
        # Extract keywords from suggested/final values
        text = f"{suggested_value} {final_value or ''}".lower()
        if 'critical' in text:
            features.append('kw_critical')
        if 'high' in text or 'breach' in text:
            features.append('kw_high')
        if 'breach' in text:
            features.append('kw_breach')
        if 'failure' in text or 'error' in text:
            features.append('kw_failure')
    elif suggestion_type == 'owner':
        # Owner history features
        if suggested_value:
            features.append(f'owner_{suggested_value.replace("@", "_").replace(".", "_")}_history')
        features.append('owner_history_base')
    
    return features


async def get_case_feedback(case_id: int) -> List[Dict[str, Any]]:
    """Get all feedback events for a case."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, case_id, suggestion_type, suggested_value, final_value,
                   action, score, user_id, created_at
            FROM ml_feedback_log
            WHERE case_id = $1
            ORDER BY created_at DESC
            """,
            case_id
        )
        return [
            {
                "id": r["id"],
                "case_id": r["case_id"],
                "suggestion_type": r["suggestion_type"],
                "suggested_value": r["suggested_value"],
                "final_value": r["final_value"],
                "action": r["action"],
                "score": r["score"],
                "user_id": r["user_id"],
                "created_at": r["created_at"]
            }
            for r in rows
        ]


async def get_feedback_stats(window_days: int = 7) -> Dict[str, Any]:
    """
    Get aggregate feedback statistics for dashboards.
    
    Args:
        window_days: Number of days to look back
    
    Returns:
        Dict with counts, acceptance rates, etc.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        cutoff = datetime.utcnow() - timedelta(days=window_days)
        
        # Counts by type and action
        rows = await conn.fetch(
            """
            SELECT suggestion_type, action, COUNT(*) as count
            FROM ml_feedback_log
            WHERE created_at >= $1
            GROUP BY suggestion_type, action
            """,
            cutoff
        )
        
        stats = {
            "window_days": window_days,
            "by_type_action": {},
            "total": 0,
            "acceptance_rate": 0.0
        }
        
        total_accepted = 0
        total_feedback = 0
        
        for row in rows:
            stype = row["suggestion_type"]
            action = row["action"]
            count = row["count"]
            
            if stype not in stats["by_type_action"]:
                stats["by_type_action"][stype] = {}
            stats["by_type_action"][stype][action] = count
            
            stats["total"] += count
            total_feedback += count
            if action == 'accepted':
                total_accepted += count
        
        if total_feedback > 0:
            stats["acceptance_rate"] = total_accepted / total_feedback
        
        return stats

