"""Repository layer for alert silences and maintenance windows."""
from typing import List, Dict, Any, Optional
from datetime import datetime
import json
from asyncpg import Pool
from .db import get_pool


async def list_active_silences(now: Optional[datetime] = None) -> List[Dict[str, Any]]:
    """List all active silences at the given time (default: now)."""
    if now is None:
        now = datetime.utcnow()
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT id, name, match_json, starts_at, ends_at, reason, created_by, created_at
               FROM alert_silences
               WHERE starts_at <= $1 AND ends_at >= $1
               ORDER BY created_at DESC""",
            now
        )
        result = []
        for r in rows:
            # Parse JSONB fields - asyncpg returns them as strings
            match_json = r["match_json"]
            if isinstance(match_json, str):
                match_json = json.loads(match_json)
            result.append({
                "id": int(r["id"]),
                "name": r["name"],
                "match_json": match_json,
                "starts_at": r["starts_at"].isoformat() if r["starts_at"] else None,
                "ends_at": r["ends_at"].isoformat() if r["ends_at"] else None,
                "reason": r["reason"],
                "created_by": r["created_by"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            })
        return result


async def list_active_maintenance(now: Optional[datetime] = None) -> List[Dict[str, Any]]:
    """List all active maintenance windows at the given time (default: now)."""
    if now is None:
        now = datetime.utcnow()
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT id, name, match_json, starts_at, ends_at, reason, created_by, created_at
               FROM maintenance_windows
               WHERE starts_at <= $1 AND ends_at >= $1
               ORDER BY created_at DESC""",
            now
        )
        result = []
        for r in rows:
            # Parse JSONB fields - asyncpg returns them as strings
            match_json = r["match_json"]
            if isinstance(match_json, str):
                match_json = json.loads(match_json)
            result.append({
                "id": int(r["id"]),
                "name": r["name"],
                "match_json": match_json,
                "starts_at": r["starts_at"].isoformat() if r["starts_at"] else None,
                "ends_at": r["ends_at"].isoformat() if r["ends_at"] else None,
                "reason": r["reason"],
                "created_by": r["created_by"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            })
        return result


async def list_silences(include_expired: bool = False) -> List[Dict[str, Any]]:
    """List all silences (optionally including expired ones)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        if include_expired:
            rows = await conn.fetch(
                """SELECT id, name, match_json, starts_at, ends_at, reason, created_by, created_at
                   FROM alert_silences
                   ORDER BY created_at DESC"""
            )
        else:
            now = datetime.utcnow()
            rows = await conn.fetch(
                """SELECT id, name, match_json, starts_at, ends_at, reason, created_by, created_at
                   FROM alert_silences
                   WHERE ends_at >= $1
                   ORDER BY starts_at ASC""",
                now
            )
        result = []
        for r in rows:
            # Parse JSONB fields - asyncpg returns them as strings
            match_json = r["match_json"]
            if isinstance(match_json, str):
                match_json = json.loads(match_json)
            result.append({
                "id": int(r["id"]),
                "name": r["name"],
                "match_json": match_json,
                "starts_at": r["starts_at"].isoformat() if r["starts_at"] else None,
                "ends_at": r["ends_at"].isoformat() if r["ends_at"] else None,
                "reason": r["reason"],
                "created_by": r["created_by"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            })
        return result


async def list_maintenance(include_expired: bool = False) -> List[Dict[str, Any]]:
    """List all maintenance windows (optionally including expired ones)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        if include_expired:
            rows = await conn.fetch(
                """SELECT id, name, match_json, starts_at, ends_at, reason, created_by, created_at
                   FROM maintenance_windows
                   ORDER BY created_at DESC"""
            )
        else:
            now = datetime.utcnow()
            rows = await conn.fetch(
                """SELECT id, name, match_json, starts_at, ends_at, reason, created_by, created_at
                   FROM maintenance_windows
                   WHERE ends_at >= $1
                   ORDER BY starts_at ASC""",
                now
            )
        result = []
        for r in rows:
            # Parse JSONB fields - asyncpg returns them as strings
            match_json = r["match_json"]
            if isinstance(match_json, str):
                match_json = json.loads(match_json)
            result.append({
                "id": int(r["id"]),
                "name": r["name"],
                "match_json": match_json,
                "starts_at": r["starts_at"].isoformat() if r["starts_at"] else None,
                "ends_at": r["ends_at"].isoformat() if r["ends_at"] else None,
                "reason": r["reason"],
                "created_by": r["created_by"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            })
        return result


async def create_silence(
    name: str,
    match_json: Dict[str, Any],
    starts_at: datetime,
    ends_at: datetime,
    reason: Optional[str] = None,
    created_by: Optional[str] = None
) -> int:
    """Create a new silence."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # asyncpg requires explicit JSON string for JSONB, or use set_type_codec
        # Convert dict to JSON string for JSONB column
        match_json_str = json.dumps(match_json)
        row = await conn.fetchrow(
            """INSERT INTO alert_silences(name, match_json, starts_at, ends_at, reason, created_by)
               VALUES ($1, $2::jsonb, $3, $4, $5, $6)
               RETURNING id""",
            name, match_json_str, starts_at, ends_at, reason, created_by or "system"
        )
        return int(row["id"])


async def create_maintenance(
    name: str,
    match_json: Dict[str, Any],
    starts_at: datetime,
    ends_at: datetime,
    reason: Optional[str] = None,
    created_by: Optional[str] = None
) -> int:
    """Create a new maintenance window."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # asyncpg requires explicit JSON string for JSONB
        # Convert dict to JSON string for JSONB column
        match_json_str = json.dumps(match_json)
        row = await conn.fetchrow(
            """INSERT INTO maintenance_windows(name, match_json, starts_at, ends_at, reason, created_by)
               VALUES ($1, $2::jsonb, $3, $4, $5, $6)
               RETURNING id""",
            name, match_json_str, starts_at, ends_at, reason, created_by or "system"
        )
        return int(row["id"])


async def delete_silence(silence_id: int) -> bool:
    """Delete a silence by ID."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM alert_silences WHERE id = $1",
            silence_id
        )
        return result == "DELETE 1"


async def delete_maintenance(maintenance_id: int) -> bool:
    """Delete a maintenance window by ID."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM maintenance_windows WHERE id = $1",
            maintenance_id
        )
        return result == "DELETE 1"


async def mark_alert_suppressed(alert_id: int, kind: str, suppress_id: int) -> None:
    """Mark an alert as suppressed by a silence or maintenance window."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """UPDATE alerts
               SET suppressed_by_kind = $1, suppressed_by_id = $2
               WHERE id = $3""",
            kind, suppress_id, alert_id
        )
