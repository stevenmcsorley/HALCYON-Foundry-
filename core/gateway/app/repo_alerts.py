from typing import List, Optional, Dict, Any
import json
from .db import get_pool


async def create_rule(payload: Dict[str, Any]) -> int:
    """Create a new alert rule and return its ID."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO alert_rules(name, description, condition_json, severity, actions_json, enabled, created_by)
               VALUES ($1, $2, $3::jsonb, $4::alert_severity, $5::jsonb, $6, $7)
               RETURNING id""",
            payload["name"],
            payload.get("description"),
            json.dumps(payload["condition_json"]),
            payload.get("severity", "medium"),
            json.dumps(payload.get("actions_json")) if payload.get("actions_json") else None,
            payload.get("enabled", True),
            payload.get("created_by")
        )
        return int(row["id"])


async def update_rule(rule_id: int, payload: Dict[str, Any]) -> None:
    """Update an existing alert rule."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """UPDATE alert_rules SET
                name=$1, description=$2, condition_json=$3::jsonb,
                severity=$4::alert_severity, actions_json=$5::jsonb, enabled=$6
               WHERE id=$7""",
            payload["name"],
            payload.get("description"),
            json.dumps(payload["condition_json"]),
            payload.get("severity", "medium"),
            json.dumps(payload.get("actions_json")) if payload.get("actions_json") else None,
            payload.get("enabled", True),
            rule_id
        )


async def delete_rule(rule_id: int) -> None:
    """Delete an alert rule."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM alert_rules WHERE id=$1", rule_id)


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
            # Convert enum to string
            if d.get("severity"):
                d["severity"] = str(d["severity"])
            result.append(d)
        return result


async def insert_alert(rule_id: int, message: str, severity: str, entity_id: Optional[str] = None) -> int:
    """Insert a new alert and return its ID."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO alerts(rule_id, entity_id, message, severity)
               VALUES ($1, $2, $3, $4::alert_severity) RETURNING id""",
            rule_id, entity_id, message, severity
        )
        return int(row["id"])


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
            for key in ["created_at", "acknowledged_at", "resolved_at"]:
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
            """INSERT INTO alert_actions_log(alert_id, action_type, status, response_code, error, latency_ms)
               VALUES ($1, $2, $3, $4, $5, $6)""",
            alert_id, action_type, status, response_code, error, latency_ms
        )
