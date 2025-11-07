from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timezone, timedelta, date

import asyncpg

from .db import get_pool
from .metrics import (
    playbook_binding_inflight,
    playbook_binding_quota_remaining,
)


def _row_to_binding(row: asyncpg.Record) -> Dict[str, Any]:
    data = dict(row)
    data["match_types"] = list(data["match_types"]) if data.get("match_types") else []
    data["match_severities"] = list(data["match_severities"]) if data.get("match_severities") else []
    data["match_tags"] = list(data["match_tags"]) if data.get("match_tags") else []
    for ts_key in ("created_at", "updated_at"):
        if data.get(ts_key) and hasattr(data[ts_key], "isoformat"):
            data[ts_key] = data[ts_key].isoformat()
    return data


def _row_to_audit(row: asyncpg.Record) -> Dict[str, Any]:
    data = dict(row)
    for ts_key in ("started_at", "finished_at"):
        if data.get(ts_key) and hasattr(data[ts_key], "isoformat"):
            data[ts_key] = data[ts_key].isoformat()
    return data


async def list_bindings(
    *,
    rule_id: Optional[int] = None,
    enabled: Optional[bool] = None,
    mode: Optional[str] = None,
) -> List[Dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        conditions: List[str] = []
        params: List[Any] = []
        idx = 1
        if rule_id is not None:
            conditions.append(f"rule_id = ${idx} OR rule_id IS NULL")
            params.append(rule_id)
            idx += 1
        if enabled is not None:
            conditions.append(f"enabled = ${idx}")
            params.append(enabled)
            idx += 1
        if mode is not None:
            conditions.append(f"mode = ${idx}")
            params.append(mode)
            idx += 1
        base = "SELECT * FROM playbook_bindings"
        if conditions:
            base += " WHERE " + " AND ".join(conditions)
        base += " ORDER BY id DESC"
        rows = await conn.fetch(base, *params)
        return [_row_to_binding(row) for row in rows]


async def get_binding(binding_id: int) -> Optional[Dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM playbook_bindings WHERE id=$1", binding_id)
        return _row_to_binding(row) if row else None


async def create_binding(data: Dict[str, Any], created_by: str) -> Dict[str, Any]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO playbook_bindings (
                tenant_id, rule_id, playbook_id, mode, match_types, match_severities, match_tags,
                max_per_minute, max_concurrent, daily_quota, enabled, created_by
            ) VALUES ($1, $2, $3, $4, $5::text[], $6::text[], $7::text[], $8, $9, $10, $11, $12)
            RETURNING *
            """,
            data.get("tenant_id"),
            data.get("rule_id"),
            data["playbook_id"],
            data["mode"],
            data.get("match_types"),
            data.get("match_severities"),
            data.get("match_tags"),
            data.get("max_per_minute", 30),
            data.get("max_concurrent", 5),
            data.get("daily_quota", 500),
            data.get("enabled", True),
            created_by,
        )
        return _row_to_binding(row)


async def update_binding(binding_id: int, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT * FROM playbook_bindings WHERE id=$1", binding_id)
        if not existing:
            return None
        merged = dict(existing)
        merged.update(data)
        row = await conn.fetchrow(
            """
            UPDATE playbook_bindings SET
                tenant_id=$1,
                rule_id=$2,
                playbook_id=$3,
                mode=$4,
                match_types=$5::text[],
                match_severities=$6::text[],
                match_tags=$7::text[],
                max_per_minute=$8,
                max_concurrent=$9,
                daily_quota=$10,
                enabled=$11,
                updated_at=NOW()
            WHERE id=$12
            RETURNING *
            """,
            merged.get("tenant_id"),
            merged.get("rule_id"),
            merged["playbook_id"],
            merged["mode"],
            merged.get("match_types"),
            merged.get("match_severities"),
            merged.get("match_tags"),
            merged.get("max_per_minute", 30),
            merged.get("max_concurrent", 5),
            merged.get("daily_quota", 500),
            merged.get("enabled", True),
            binding_id,
        )
        return _row_to_binding(row) if row else None


async def delete_binding(binding_id: int) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM playbook_bindings WHERE id=$1", binding_id)
        await conn.execute("DELETE FROM playbook_binding_usage WHERE binding_id=$1", binding_id)


async def list_audit_entries(alert_id: int) -> List[Dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM playbook_run_audit WHERE alert_id=$1 ORDER BY started_at DESC",
            alert_id,
        )
        return [_row_to_audit(r) for r in rows]


async def insert_audit_entry(data: Dict[str, Any]) -> Dict[str, Any]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO playbook_run_audit (
                alert_id, binding_id, playbook_id, mode, decision, reason,
                requested_by, started_at, finished_at, success, output_ref
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
            """,
            data["alert_id"],
            data.get("binding_id"),
            data["playbook_id"],
            data["mode"],
            data["decision"],
            data.get("reason"),
            data.get("requested_by"),
            data.get("started_at", datetime.now(timezone.utc)),
            data.get("finished_at"),
            data.get("success"),
            data.get("output_ref"),
        )
        return _row_to_audit(row)


async def update_audit_entry(audit_id: int, **updates: Any) -> Optional[Dict[str, Any]]:
    if not updates:
        return None
    fields = []
    params = []
    idx = 1
    for key, value in updates.items():
        fields.append(f"{key} = ${idx}")
        params.append(value)
        idx += 1
    params.append(audit_id)
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"UPDATE playbook_run_audit SET {', '.join(fields)} WHERE id=${idx} RETURNING *",
            *params,
        )
        return _row_to_audit(row) if row else None


async def _ensure_usage_row(conn: asyncpg.Connection, binding_id: int, max_per_minute: int) -> asyncpg.Record:
    usage = await conn.fetchrow(
        "SELECT * FROM playbook_binding_usage WHERE binding_id=$1 FOR UPDATE",
        binding_id,
    )
    now = datetime.now(timezone.utc)
    if not usage:
        usage = await conn.fetchrow(
            """
            INSERT INTO playbook_binding_usage (binding_id, day_utc, count_today, tokens, refilled_at, in_flight)
            VALUES ($1, $2, 0, $3, $4, 0)
            RETURNING *
            """,
            binding_id,
            now.date(),
            max_per_minute,
            now,
        )
    return usage


def _reset_if_new_day(usage: asyncpg.Record, today: date, max_per_minute: int, now: datetime) -> asyncpg.Record:
    if usage["day_utc"] != today:
        usage = usage.copy()
        usage["day_utc"] = today
        usage["count_today"] = 0
        usage["tokens"] = max_per_minute
        usage["refilled_at"] = now
        usage["in_flight"] = 0
    return usage


async def try_acquire_binding(
    binding: Dict[str, Any],
    *,
    for_run: bool,
    increment_daily: bool,
    dry_run: bool = False,
) -> Tuple[bool, str | None]:
    """Attempt to acquire guardrails for a binding. Returns (allowed, decision_if_blocked).

    When dry_run=True, no counters are mutated and metrics are not updated.
    """
    binding_id = binding["id"]
    pool = await get_pool()
    now = datetime.now(timezone.utc)
    today = now.date()
    max_per_minute = binding.get("max_per_minute") or 0
    max_concurrent = binding.get("max_concurrent") or 0
    daily_quota = binding.get("daily_quota") or 0

    async with pool.acquire() as conn:
        async with conn.transaction():
            usage = await _ensure_usage_row(conn, binding_id, max_per_minute)
            usage = _reset_if_new_day(usage, today, max_per_minute, now)

            tokens = usage["tokens"]
            refilled_at = usage["refilled_at"]
            if max_per_minute > 0:
                if not refilled_at:
                    tokens = max_per_minute
                    refilled_at = now
                else:
                    elapsed = (now - refilled_at).total_seconds()
                    if elapsed >= 60:
                        tokens = max_per_minute
                        refilled_at = now

            if for_run and max_concurrent > 0 and usage["in_flight"] >= max_concurrent:
                return False, "concurrency_blocked"

            if increment_daily and daily_quota > 0 and usage["count_today"] >= daily_quota:
                return False, "quota_exhausted"

            if max_per_minute > 0:
                if tokens is None:
                    tokens = max_per_minute
                if tokens <= 0:
                    return False, "rate_limited"
                tokens -= 1

            new_inflight = usage["in_flight"] + (1 if for_run else 0)
            new_count = usage["count_today"] + (1 if increment_daily else 0)

            if not dry_run:
                await conn.execute(
                    """
                    UPDATE playbook_binding_usage
                    SET day_utc=$2, count_today=$3, tokens=$4, refilled_at=$5, in_flight=$6
                    WHERE binding_id=$1
                    """,
                    binding_id,
                    usage["day_utc"],
                    new_count,
                    tokens,
                    refilled_at,
                    new_inflight,
                )

    if not dry_run:
        playbook_binding_inflight.labels(binding_id=str(binding_id)).set(new_inflight)
        if daily_quota > 0:
            playbook_binding_quota_remaining.labels(binding_id=str(binding_id)).set(max(daily_quota - new_count, 0))
        else:
            playbook_binding_quota_remaining.labels(binding_id=str(binding_id)).set(-1)
    return True, None


async def release_inflight(binding_id: int) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            usage = await conn.fetchrow(
                "SELECT in_flight FROM playbook_binding_usage WHERE binding_id=$1 FOR UPDATE",
                binding_id,
            )
            if not usage:
                return
            new_value = max(usage["in_flight"] - 1, 0)
            await conn.execute(
                "UPDATE playbook_binding_usage SET in_flight=$2 WHERE binding_id=$1",
                binding_id,
                new_value,
            )
    playbook_binding_inflight.labels(binding_id=str(binding_id)).set(new_value)


def binding_matches_alert(binding: Dict[str, Any], alert: Dict[str, Any]) -> bool:
    if not binding.get("enabled", True):
        return False
    rule_id = binding.get("rule_id")
    if rule_id is not None and rule_id != alert.get("ruleId"):
        return False
    alert_type = alert.get("type")
    alert_severity = alert.get("severity")
    alert_tags = set(alert.get("tags", []) or [])

    match_types = binding.get("match_types") or []
    if match_types and alert_type not in match_types:
        return False
    match_severities = binding.get("match_severities") or []
    if match_severities and alert_severity not in match_severities:
        return False
    match_tags = set(binding.get("match_tags") or [])
    if match_tags and alert_tags.isdisjoint(match_tags):
        return False
    return True


async def select_active_bindings_for_alert(alert: Dict[str, Any]) -> List[Dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM playbook_bindings WHERE enabled=true")
        bindings = [_row_to_binding(row) for row in rows]
        return [b for b in bindings if binding_matches_alert(b, alert)]
