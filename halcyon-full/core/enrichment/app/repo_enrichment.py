"""Repository layer for enrichment actions and playbooks."""
import asyncpg
import json
from typing import List, Dict, Any, Optional
from datetime import datetime
from .db import get_pool


async def list_actions() -> List[Dict[str, Any]]:
    """List all enrichment actions."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM enrichment_actions WHERE enabled = TRUE ORDER BY name")
        return [
            {
                "id": r["id"],
                "name": r["name"],
                "kind": r["kind"],
                "config": json.loads(r["config_json"]) if isinstance(r["config_json"], str) else r["config_json"],
                "enabled": r["enabled"],
                "createdAt": r["created_at"].isoformat() if r["created_at"] else None
            }
            for r in rows
        ]


async def get_action(action_id: str) -> Optional[Dict[str, Any]]:
    """Get a single action by ID."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM enrichment_actions WHERE id = $1", action_id)
        if not row:
            return None
        return {
            "id": row["id"],
            "name": row["name"],
            "kind": row["kind"],
            "config": json.loads(row["config_json"]) if isinstance(row["config_json"], str) else row["config_json"],
            "enabled": row["enabled"],
            "createdAt": row["created_at"].isoformat() if row["created_at"] else None
        }


async def list_playbooks() -> List[Dict[str, Any]]:
    """List all playbooks."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM playbooks WHERE enabled = TRUE ORDER BY name")
        return [
            {
                "id": r["id"],
                "name": r["name"],
                "version": r["version"],
                "steps": json.loads(r["steps_json"]) if isinstance(r["steps_json"], str) else r["steps_json"],
                "enabled": r["enabled"],
                "createdAt": r["created_at"].isoformat() if r["created_at"] else None
            }
            for r in rows
        ]


async def get_playbook(playbook_id: str) -> Optional[Dict[str, Any]]:
    """Get a single playbook by ID."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM playbooks WHERE id = $1", playbook_id)
        if not row:
            return None
        return {
            "id": row["id"],
            "name": row["name"],
            "version": row["version"],
            "steps": json.loads(row["steps_json"]) if isinstance(row["steps_json"], str) else row["steps_json"],
            "enabled": row["enabled"],
            "createdAt": row["created_at"].isoformat() if row["created_at"] else None
        }


async def create_enrichment_run(
    run_id: str,
    subject_kind: str,
    subject_id: str,
    action_id: str,
    status: str,
    started_at: datetime,
    user_id: Optional[str] = None,
    idempotency_key: Optional[str] = None
) -> str:
    """Create an enrichment run record."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO enrichment_runs
            (id, subject_kind, subject_id, kind, ref_json, status, started_at, user_id, idempotency_key)
            VALUES ($1, $2, $3, 'action', $4::jsonb, $5, $6, $7, $8)
            """,
            run_id, subject_kind, subject_id, json.dumps({"actionId": action_id}), status, started_at, user_id, idempotency_key
        )
    return run_id


async def update_enrichment_run(
    run_id: str,
    status: str,
    finished_at: datetime,
    output: Optional[Dict[str, Any]] = None,
    error: Optional[str] = None,
    metrics: Optional[Dict[str, Any]] = None
):
    """Update an enrichment run with results."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE enrichment_runs
            SET status = $1, finished_at = $2, output_json = $3, error_text = $4, metrics_json = $5
            WHERE id = $6
            """,
            status, finished_at, json.dumps(output) if output else None, error, json.dumps(metrics) if metrics else None, run_id
        )


async def create_playbook_run(
    run_id: str,
    subject_kind: str,
    subject_id: str,
    playbook_id: str,
    status: str,
    started_at: datetime,
    steps_json: List[Dict[str, Any]],
    user_id: Optional[str] = None,
    idempotency_key: Optional[str] = None
) -> str:
    """Create a playbook run record."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO playbook_runs
            (id, subject_kind, subject_id, playbook_id, status, started_at, steps_json, user_id, idempotency_key)
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
            """,
            run_id, subject_kind, subject_id, playbook_id, status, started_at, json.dumps(steps_json), user_id, idempotency_key
        )
    return run_id


async def update_playbook_run(
    run_id: str,
    status: str,
    finished_at: datetime,
    steps_json: List[Dict[str, Any]],
    output: Optional[Dict[str, Any]] = None,
    error: Optional[str] = None,
    metrics: Optional[Dict[str, Any]] = None
):
    """Update a playbook run with results."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE playbook_runs
            SET status = $1, finished_at = $2, steps_json = $3::jsonb, output_json = $4, error_text = $5, metrics_json = $6
            WHERE id = $7
            """,
            status, finished_at, json.dumps(steps_json), json.dumps(output) if output else None, error, json.dumps(metrics) if metrics else None, run_id
        )


async def list_runs(subject_kind: str, subject_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """List runs for a subject (enrichment + playbook runs merged)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Get enrichment runs
        enrich_rows = await conn.fetch(
            """
            SELECT id, subject_kind, subject_id, kind, ref_json, status, started_at, finished_at,
                   output_json, error_text, metrics_json, user_id
            FROM enrichment_runs
            WHERE subject_kind = $1 AND subject_id = $2
            ORDER BY started_at DESC
            LIMIT $3
            """,
            subject_kind, subject_id, limit
        )
        
        # Get playbook runs
        playbook_rows = await conn.fetch(
            """
            SELECT id, subject_kind, subject_id, playbook_id, status, started_at, finished_at,
                   steps_json, output_json, error_text, metrics_json, user_id
            FROM playbook_runs
            WHERE subject_kind = $1 AND subject_id = $2
            ORDER BY started_at DESC
            LIMIT $3
            """,
            subject_kind, subject_id, limit
        )
        
        runs = []
        
        # Process enrichment runs
        for r in enrich_rows:
            ref = json.loads(r["ref_json"]) if isinstance(r["ref_json"], str) else r["ref_json"]
            runs.append({
                "id": r["id"],
                "subjectKind": r["subject_kind"],
                "subjectId": r["subject_id"],
                "kind": "action",
                "ref": ref,
                "status": r["status"],
                "startedAt": r["started_at"].isoformat() if r["started_at"] else None,
                "finishedAt": r["finished_at"].isoformat() if r["finished_at"] else None,
                "output": json.loads(r["output_json"]) if r["output_json"] and isinstance(r["output_json"], str) else r["output_json"],
                "error": r["error_text"],
                "metrics": json.loads(r["metrics_json"]) if r["metrics_json"] and isinstance(r["metrics_json"], str) else r["metrics_json"] or {},
                "userId": r["user_id"]
            })
        
        # Process playbook runs
        for r in playbook_rows:
            steps = json.loads(r["steps_json"]) if isinstance(r["steps_json"], str) else r["steps_json"]
            runs.append({
                "id": r["id"],
                "subjectKind": r["subject_kind"],
                "subjectId": r["subject_id"],
                "kind": "playbook",
                "ref": {"playbookId": r["playbook_id"]},
                "status": r["status"],
                "startedAt": r["started_at"].isoformat() if r["started_at"] else None,
                "finishedAt": r["finished_at"].isoformat() if r["finished_at"] else None,
                "output": json.loads(r["output_json"]) if r["output_json"] and isinstance(r["output_json"], str) else r["output_json"],
                "error": r["error_text"],
                "metrics": json.loads(r["metrics_json"]) if r["metrics_json"] and isinstance(r["metrics_json"], str) else r["metrics_json"] or {},
                "userId": r["user_id"],
                "steps": steps
            })
        
        # Sort by started_at descending (newest first)
        runs.sort(key=lambda x: x["startedAt"] or "", reverse=True)
        return runs[:limit]

