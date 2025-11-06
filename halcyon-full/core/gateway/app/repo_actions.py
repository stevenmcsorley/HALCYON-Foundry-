"""Repository functions for alert action logs and delivery trace."""
from typing import List, Dict, Any, Optional
from datetime import datetime
import asyncpg
from .db import get_pool


async def list_action_logs(conn: asyncpg.Connection, alert_id: int) -> List[Dict[str, Any]]:
    """
    Get all action log entries for an alert, ordered by attempt (descending).
    
    Returns timeline of all delivery attempts.
    """
    rows = await conn.fetch(
        """
        SELECT 
            id, alert_id, dest, status, http_status, error, 
            COALESCE(attempt, retry_count + 1) as attempt,
            COALESCE(scheduled_at, next_retry_at) as scheduled_at,
            sent_at, created_at, payload
        FROM alert_actions_log
        WHERE alert_id = $1
        ORDER BY COALESCE(attempt, retry_count + 1) DESC, created_at DESC
        """,
        alert_id
    )
    
    return [
        {
            "id": r["id"],
            "alert_id": r["alert_id"],
            "dest": r["dest"],
            "status": r["status"],
            "http_status": r["http_status"],
            "error": r["error"],
            "attempt": r["attempt"],
            "scheduled_at": r["scheduled_at"],
            "sent_at": r["sent_at"],
            "created_at": r["created_at"],
            "payload": r["payload"]
        }
        for r in rows
    ]


async def get_latest_per_dest(conn: asyncpg.Connection, alert_id: int) -> Dict[str, Dict[str, Any]]:
    """
    Get the latest action log entry per destination for an alert.
    
    Returns dict mapping dest -> latest ActionLog entry.
    """
    rows = await conn.fetch(
        """
        SELECT DISTINCT ON (dest)
            id, alert_id, dest, status, http_status, error,
            COALESCE(attempt, retry_count + 1) as attempt,
            COALESCE(scheduled_at, next_retry_at) as scheduled_at,
            sent_at, created_at, payload
        FROM alert_actions_log
        WHERE alert_id = $1
        ORDER BY dest, COALESCE(attempt, retry_count + 1) DESC, created_at DESC
        """,
        alert_id
    )
    
    return {
        r["dest"]: {
            "id": r["id"],
            "alert_id": r["alert_id"],
            "dest": r["dest"],
            "status": r["status"],
            "http_status": r["http_status"],
            "error": r["error"],
            "attempt": r["attempt"],
            "scheduled_at": r["scheduled_at"],
            "sent_at": r["sent_at"],
            "created_at": r["created_at"],
            "payload": r["payload"]
        }
        for r in rows
    }


async def enqueue_manual_retry(
    conn: asyncpg.Connection,
    alert_id: int,
    dest: str,
    reason: str,
    user_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Enqueue a manual retry for a specific destination.
    
    This creates a new alert_actions_log entry with:
    - status = 'retry' (or 'retry_scheduled' if we want to distinguish)
    - attempt = previous max attempt + 1
    - scheduled_at = NOW() (immediate retry)
    
    Returns the newly created action log entry.
    """
    # Get the max attempt number for this alert+dest
    max_attempt_row = await conn.fetchrow(
        """
        SELECT MAX(COALESCE(attempt, retry_count + 1)) as max_attempt
        FROM alert_actions_log
        WHERE alert_id = $1 AND dest = $2
        """,
        alert_id, dest
    )
    
    next_attempt = (max_attempt_row["max_attempt"] or 0) + 1
    
    # Insert new retry entry
    row = await conn.fetchrow(
        """
        INSERT INTO alert_actions_log
        (alert_id, dest, status, error, attempt, scheduled_at, sent_at, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NULL, NOW())
        RETURNING id, alert_id, dest, status, http_status, error, attempt,
                  COALESCE(scheduled_at, next_retry_at) as scheduled_at,
                  sent_at, created_at, payload
        """,
        alert_id, dest, "retry", f"Manual retry: {reason}", next_attempt
    )
    
    return {
        "id": row["id"],
        "alert_id": row["alert_id"],
        "dest": row["dest"],
        "status": row["status"],
        "http_status": row["http_status"],
        "error": row["error"],
        "attempt": row["attempt"],
        "scheduled_at": row["scheduled_at"],
        "sent_at": row["sent_at"],
        "created_at": row["created_at"],
        "payload": row["payload"]
    }


async def get_failed_destinations(conn: asyncpg.Connection, alert_id: int) -> List[str]:
    """
    Get list of destinations that have failed (status='failed' or latest attempt failed).
    """
    rows = await conn.fetch(
        """
        SELECT DISTINCT dest
        FROM alert_actions_log
        WHERE alert_id = $1 
          AND status IN ('failed', 'retry')
          AND dest NOT IN (
              SELECT dest 
              FROM alert_actions_log 
              WHERE alert_id = $1 AND status = 'success'
          )
        """,
        alert_id
    )
    
    return [r["dest"] for r in rows]

