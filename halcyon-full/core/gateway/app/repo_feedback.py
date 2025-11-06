"""Repository layer for ML feedback and weights."""
import asyncpg
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from .db import get_pool


async def insert_feedback_log(
    conn: asyncpg.Connection,
    case_id: int,
    suggestion_type: str,
    suggested_value: str,
    final_value: Optional[str],
    action: str,
    score: Optional[float],
    user_id: Optional[str],
) -> Dict[str, Any]:
    """Insert a feedback log entry."""
    row = await conn.fetchrow(
        """
        INSERT INTO ml_feedback_log
        (case_id, suggestion_type, suggested_value, final_value, action, score, user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, created_at
        """,
        case_id, suggestion_type, suggested_value, final_value, action, score, user_id
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


async def get_feedback_by_case(conn: asyncpg.Connection, case_id: int) -> List[Dict[str, Any]]:
    """Get all feedback for a case."""
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
            "score": float(r["score"]) if r["score"] is not None else None,
            "user_id": r["user_id"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None
        }
        for r in rows
    ]


async def get_feedback_stats(
    conn: asyncpg.Connection,
    window_days: int = 7
) -> Dict[str, Any]:
    """Get aggregate feedback statistics."""
    cutoff = datetime.utcnow() - timedelta(days=window_days)
    
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

