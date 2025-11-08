from typing import List, Optional, Dict, Any, Tuple
import json
from datetime import datetime as dt, timezone
import asyncpg
from .db import get_pool


async def create_rule(payload: Dict[str, Any]) -> int:
    """Create a new alert rule and return its ID."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO alert_rules(
                name, description, condition_json, severity, actions_json, enabled, created_by,
                fingerprint_template, correlation_keys, mute_seconds, route
            )
               VALUES ($1, $2, $3::jsonb, $4::alert_severity, $5::jsonb, $6, $7, $8, $9::jsonb, $10, $11::jsonb)
               RETURNING id""",
            payload["name"],
            payload.get("description"),
            json.dumps(payload["condition_json"]),
            payload.get("severity", "medium"),
            json.dumps(payload.get("actions_json")) if payload.get("actions_json") else None,
            payload.get("enabled", True),
            payload.get("created_by"),
            payload.get("fingerprint_template"),
            json.dumps(payload.get("correlation_keys")) if payload.get("correlation_keys") else None,
            payload.get("mute_seconds", 0),
            json.dumps(payload.get("route")) if payload.get("route") else None
        )
        return int(row["id"])


async def update_rule(rule_id: int, payload: Dict[str, Any]) -> None:
    """Update an existing alert rule."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """UPDATE alert_rules SET
                name=$1, description=$2, condition_json=$3::jsonb,
                severity=$4::alert_severity, actions_json=$5::jsonb, enabled=$6,
                fingerprint_template=$8, correlation_keys=$9::jsonb, mute_seconds=$10, route=$11::jsonb
               WHERE id=$7""",
            payload["name"],
            payload.get("description"),
            json.dumps(payload["condition_json"]),
            payload.get("severity", "medium"),
            json.dumps(payload.get("actions_json")) if payload.get("actions_json") else None,
            payload.get("enabled", True),
            rule_id,
            payload.get("fingerprint_template"),
            json.dumps(payload.get("correlation_keys")) if payload.get("correlation_keys") else None,
            payload.get("mute_seconds", 0),
            json.dumps(payload.get("route")) if payload.get("route") else None
        )


async def delete_rule(rule_id: int) -> None:
    """Delete an alert rule."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM alert_rules WHERE id=$1", rule_id)


async def get_rule(conn: asyncpg.Connection, rule_id: int) -> Optional[Dict[str, Any]]:
    """Get a single alert rule by ID."""
    row = await conn.fetchrow("SELECT * FROM alert_rules WHERE id=$1", rule_id)
    if not row:
        return None
    d = dict(row)
    # Parse JSONB fields
    if d.get("condition_json"):
        d["condition_json"] = json.loads(d["condition_json"]) if isinstance(d["condition_json"], str) else d["condition_json"]
    if d.get("actions_json"):
        d["actions_json"] = json.loads(d["actions_json"]) if isinstance(d["actions_json"], str) else d["actions_json"]
    if d.get("correlation_keys"):
        d["correlation_keys"] = json.loads(d["correlation_keys"]) if isinstance(d["correlation_keys"], str) else d["correlation_keys"]
    if d.get("route"):
        d["route"] = json.loads(d["route"]) if isinstance(d["route"], str) else d["route"]
    # Convert enum to string
    if d.get("severity"):
        d["severity"] = str(d["severity"])
    return d


async def list_rules() -> List[Dict[str, Any]]:
    """List all alert rules."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM alert_rules ORDER BY id DESC")
        result = []
        for row in rows:
            d = dict(row)
            # Parse JSONB fields
            if d.get("condition_json"):
                d["condition_json"] = json.loads(d["condition_json"]) if isinstance(d["condition_json"], str) else d["condition_json"]
            if d.get("actions_json"):
                d["actions_json"] = json.loads(d["actions_json"]) if isinstance(d["actions_json"], str) else d["actions_json"]
            if d.get("correlation_keys"):
                d["correlation_keys"] = json.loads(d["correlation_keys"]) if isinstance(d["correlation_keys"], str) else d["correlation_keys"]
            if d.get("route"):
                d["route"] = json.loads(d["route"]) if isinstance(d["route"], str) else d["route"]
            # Convert enum to string
            if d.get("severity"):
                d["severity"] = str(d["severity"])
            # Convert created_at to ISO string if it's a datetime
            if d.get("created_at") and hasattr(d["created_at"], "isoformat"):
                d["created_at"] = d["created_at"].isoformat()
            result.append(d)
        return result


async def upsert_alert(
    rule_id: int,
    message: str,
    severity: str,
    fingerprint: str,
    entity_id: Optional[str] = None,
    group_key: Optional[str] = None,
    mute_seconds: int = 0
) -> Tuple[int, bool]:
    """
    Upsert alert: find open alert by fingerprint and update, or create new.
    Returns (alert_id, was_created) where was_created is True for new alerts, False for dedupe updates.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        now = dt.now(tz=timezone.utc)
        
        # Check for existing open alert with same fingerprint
        if mute_seconds > 0:
            existing = await conn.fetchrow(
                """SELECT id, last_seen, count FROM alerts
                   WHERE fingerprint=$1 AND status='open'::alert_status
                   ORDER BY id DESC LIMIT 1""",
                fingerprint
            )
            
            if existing:
                # Check if within mute window
                last_seen = existing["last_seen"]
                if last_seen:
                    if last_seen.tzinfo is None:
                        last_seen = last_seen.replace(tzinfo=timezone.utc)
                    age_seconds = (now - last_seen).total_seconds()
                    if age_seconds < mute_seconds:
                        # Dedupe: update count and last_seen
                        await conn.execute(
                            """UPDATE alerts
                               SET count=count+1, last_seen=$1
                               WHERE id=$2""",
                            now, existing["id"]
                        )
                        return (int(existing["id"]), False)
        
        # Create new alert
        row = await conn.fetchrow(
            """INSERT INTO alerts(rule_id, entity_id, message, severity, fingerprint, group_key, first_seen, last_seen, count, status)
               VALUES ($1, $2, $3, $4::alert_severity, $5, $6, $7, $8, 1, 'open'::alert_status)
               RETURNING id""",
            rule_id, entity_id, message, severity, fingerprint, group_key, now, now
        )
        return (int(row["id"]), True)


async def insert_alert(
    rule_id: int,
    message: str,
    severity: str,
    entity_id: Optional[str] = None,
    fingerprint: Optional[str] = None,
    group_key: Optional[str] = None
) -> int:
    """
    Insert a new alert and return its ID.
    DEPRECATED: Use upsert_alert for deduplication support.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        now = dt.utcnow()
        row = await conn.fetchrow(
            """INSERT INTO alerts(rule_id, entity_id, message, severity, fingerprint, group_key, first_seen, last_seen, count, status)
               VALUES ($1, $2, $3, $4::alert_severity, $5, $6, $7, $8, 1, 'open'::alert_status) RETURNING id""",
            rule_id, entity_id, message, severity, fingerprint, group_key, now, now
        )
        return int(row["id"])


async def get_alert(alert_id: int) -> Optional[Dict[str, Any]]:
    """Get a single alert by ID."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM alerts WHERE id=$1", alert_id)
        if not row:
            return None
        d = dict(row)
        # Convert enums to strings
        if d.get("status"):
            d["status"] = str(d["status"])
        if d.get("severity"):
            d["severity"] = str(d["severity"])
        # Convert timestamps to ISO strings
        for key in ["created_at", "acknowledged_at", "resolved_at", "first_seen", "last_seen"]:
            if d.get(key):
                d[key] = d[key].isoformat()
        return d


async def list_alerts(status: Optional[str] = None, severity: Optional[str] = None, limit: int = 200) -> List[Dict[str, Any]]:
    """List alerts with optional filters."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        base = "SELECT * FROM alerts"
        conds, args = [], []
        param_idx = 1
        if status:
            conds.append(f"status=${param_idx}::alert_status")
            args.append(status)
            param_idx += 1
        if severity:
            conds.append(f"severity=${param_idx}::alert_severity")
            args.append(severity)
            param_idx += 1
        if conds:
            base += " WHERE " + " AND ".join(conds)
        base += f" ORDER BY created_at DESC LIMIT ${param_idx}"
        args.append(limit)
        
        rows = await conn.fetch(base, *args)
        result = []
        for row in rows:
            d = dict(row)
            # Convert enums to strings
            if d.get("status"):
                d["status"] = str(d["status"])
            if d.get("severity"):
                d["severity"] = str(d["severity"])
            # Convert timestamps to ISO strings
            for key in ["created_at", "acknowledged_at", "resolved_at", "first_seen", "last_seen"]:
                if d.get(key):
                    d[key] = d[key].isoformat()
            result.append(d)
        return result


async def ack_alert(alert_id: int, user_id: str) -> None:
    """Acknowledge an alert."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE alerts SET status='ack'::alert_status, acknowledged_at=NOW(), acknowledged_by=$2 WHERE id=$1",
            alert_id, user_id
        )


async def resolve_alert(alert_id: int, user_id: str) -> None:
    """Resolve an alert."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE alerts SET status='resolved'::alert_status, resolved_at=NOW(), resolved_by=$2 WHERE id=$1",
            alert_id, user_id
        )


async def log_action(alert_id: int, action_type: str, status: str, response_code: Optional[int] = None, error: Optional[str] = None, latency_ms: Optional[int] = None) -> None:
    """Log an action execution."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO alert_actions_log(alert_id, action_type, dest, status, response_code, error, latency_ms)
               VALUES ($1, $2, $2, $3, $4, $5, $6)""",
            alert_id, action_type, status, response_code, error, latency_ms
        )

# PR-3: Action logging and retry helpers

async def insert_action_log(
    alert_id: int,
    dest: str,
    status: str,
    error: Optional[str],
    retry_count: int,
    next_retry_at: Optional[dt],
    payload: Optional[Dict[str, Any]]
) -> int:
    """Insert an action log entry."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO alert_actions_log(alert_id, dest, status, error, retry_count, next_retry_at, payload)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               RETURNING id""",
            alert_id, dest, status, error, retry_count, next_retry_at, json.dumps(payload) if payload else None
        )
        return int(row["id"])


async def select_pending_retries_update() -> List[Dict[str, Any]]:
    """
    Select and atomically claim pending retries using FOR UPDATE SKIP LOCKED.
    Returns rows with alert data and route for processing.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT aal.id, aal.alert_id, aal.dest, aal.retry_count, ar.route, 
                      json_build_object(
                          'id', a.id,
                          'message', a.message,
                          'severity', a.severity,
                          'status', a.status,
                          'count', a.count
                      ) as alert
               FROM alert_actions_log aal
               JOIN alerts a ON a.id = aal.alert_id
               JOIN alert_rules ar ON ar.id = a.rule_id
               WHERE aal.status = 'retry' 
                 AND aal.next_retry_at <= CURRENT_TIMESTAMP
               FOR UPDATE SKIP LOCKED
               LIMIT 50"""
        )
        return [
            {
                "id": int(r["id"]),
                "alert_id": int(r["alert_id"]),
                "dest": r["dest"],
                "retry_count": int(r["retry_count"]),
                "route": r["route"] or {},
                "alert": r["alert"],
            }
            for r in rows
        ]


async def mark_action_success(action_id: int) -> None:
    """Mark an action as successful."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """UPDATE alert_actions_log
               SET status = 'success', next_retry_at = NULL
               WHERE id = $1""",
            action_id
        )


async def mark_action_retry(
    alert_id: int,
    dest: str,
    retry_count: int,
    next_retry_at: dt,
    error: Optional[str] = None
) -> None:
    """Mark an action for retry by alert_id and dest (creates or updates log entry)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Find the most recent retry entry for this alert/dest
        existing = await conn.fetchrow(
            """SELECT id FROM alert_actions_log
               WHERE alert_id = $1 AND dest = $2 AND status = 'retry'
               ORDER BY id DESC LIMIT 1""",
            alert_id, dest
        )
        
        if existing:
            # Update existing entry
            await conn.execute(
                """UPDATE alert_actions_log
                   SET retry_count = $1, next_retry_at = $2, error = $3
                   WHERE id = $4""",
                retry_count, next_retry_at, error, existing["id"]
            )
        else:
            # Create new retry entry (shouldn't happen, but handle gracefully)
            await conn.execute(
                """INSERT INTO alert_actions_log(alert_id, dest, status, retry_count, next_retry_at, error)
                   VALUES ($1, $2, 'retry', $3, $4, $5)""",
                alert_id, dest, retry_count, next_retry_at, error
            )


async def mark_action_failed(action_id: int, error: str) -> None:
    """Mark an action as failed (max retries exhausted)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """UPDATE alert_actions_log
               SET status = 'failed', next_retry_at = NULL, error = $1
               WHERE id = $2""",
            error[:500], action_id  # Truncate error to 500 chars
        )
