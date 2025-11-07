from __future__ import annotations

from typing import Optional, List, Dict, Any, Sequence
from uuid import UUID
from datetime import datetime, timezone
import json

import asyncpg

from .db import get_pool


def _parse_json(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


def _row_to_datasource(row: asyncpg.Record, state: Optional[asyncpg.Record] = None, version: Optional[int] = None) -> Dict[str, Any]:
    data = dict(row)
    data["tags"] = list(data.get("tags") or [])
    data["status"] = str(data.get("status")) if data.get("status") is not None else None
    if data.get("created_at") and hasattr(data["created_at"], "isoformat"):
        data["created_at"] = data["created_at"].replace(tzinfo=timezone.utc) if data["created_at"].tzinfo is None else data["created_at"]
    if data.get("updated_at") and hasattr(data["updated_at"], "isoformat"):
        data["updated_at"] = data["updated_at"].replace(tzinfo=timezone.utc) if data["updated_at"].tzinfo is None else data["updated_at"]
    if data.get("archived_at") and hasattr(data["archived_at"], "isoformat"):
        data["archived_at"] = data["archived_at"].replace(tzinfo=timezone.utc) if data["archived_at"].tzinfo is None else data["archived_at"]
    if state:
        data["current_version"] = state.get("current_version")
        data["state"] = {
            "worker_status": str(state.get("worker_status")) if state.get("worker_status") else None,
            "last_heartbeat_at": state.get("last_heartbeat_at"),
            "last_event_at": state.get("last_event_at"),
            "error_code": state.get("error_code"),
            "error_message": state.get("error_message"),
            "metrics": _parse_json(state.get("metrics_snapshot")) or {},
            "updated_at": state.get("updated_at"),
        }
    else:
        data["current_version"] = version
    return data


def _row_to_version(row: asyncpg.Record) -> Dict[str, Any]:
    data = dict(row)
    data["config_json"] = _parse_json(data.get("config_json")) or {}
    data["state"] = str(data.get("state")) if data.get("state") else None
    return data


def _row_to_event(row: asyncpg.Record) -> Dict[str, Any]:
    data = dict(row)
    data["payload"] = _parse_json(data.get("payload")) or {}
    return data


async def list_datasources(
    *,
    status: Optional[str] = None,
    types: Optional[Sequence[str]] = None,
    owner_id: Optional[str] = None,
    org_id: Optional[UUID] = None,
    project_id: Optional[UUID] = None,
    search: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        clauses = ["d.archived_at IS NULL"]
        values: List[Any] = []

        if status:
            values.append(status)
            clauses.append(f"d.status = ${len(values)}")
        if types:
            values.append(list(types))
            clauses.append(f"d.type = ANY(${len(values)})")
        if owner_id:
            values.append(owner_id)
            clauses.append(f"d.owner_id = ${len(values)}")
        if org_id:
            values.append(org_id)
            clauses.append(f"d.org_id = ${len(values)}")
        if project_id:
            values.append(project_id)
            clauses.append(f"d.project_id = ${len(values)}")
        if search:
            values.append(f"%{search}%")
            clauses.append(f"(d.name ILIKE ${len(values)} OR d.description ILIKE ${len(values)})")

        where_sql = " WHERE " + " AND ".join(clauses) if clauses else ""
        values.extend([limit, offset])
        query = (
            "SELECT d.*, s.current_version, s.worker_status, s.last_heartbeat_at, s.last_event_at, s.error_code, "
            "s.error_message, s.metrics_snapshot, s.updated_at as state_updated_at "
            "FROM datasources d "
            "LEFT JOIN datasource_state s ON s.datasource_id = d.id "
            f"{where_sql} "
            "ORDER BY d.updated_at DESC "
            f"LIMIT ${len(values)-1} OFFSET ${len(values)}"
        )

        rows = await conn.fetch(query, *values)
        results = []
        for row in rows:
            state = {
                "current_version": row.get("current_version"),
                "worker_status": row.get("worker_status"),
                "last_heartbeat_at": row.get("last_heartbeat_at"),
                "last_event_at": row.get("last_event_at"),
                "error_code": row.get("error_code"),
                "error_message": row.get("error_message"),
                "metrics_snapshot": row.get("metrics_snapshot"),
                "updated_at": row.get("state_updated_at"),
            }
            results.append(_row_to_datasource(row, state))
        return results


async def get_datasource(datasource_id: UUID) -> Optional[Dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT d.*, s.current_version, s.worker_status, s.last_heartbeat_at, s.last_event_at,
                   s.error_code, s.error_message, s.metrics_snapshot, s.updated_at AS state_updated_at
            FROM datasources d
            LEFT JOIN datasource_state s ON s.datasource_id = d.id
            WHERE d.id = $1
            """,
            datasource_id,
        )
        if not row:
            return None
        state = {
            "current_version": row.get("current_version"),
            "worker_status": row.get("worker_status"),
            "last_heartbeat_at": row.get("last_heartbeat_at"),
            "last_event_at": row.get("last_event_at"),
            "error_code": row.get("error_code"),
            "error_message": row.get("error_message"),
            "metrics_snapshot": row.get("metrics_snapshot"),
            "updated_at": row.get("state_updated_at"),
        }
        return _row_to_datasource(row, state)


async def create_datasource(payload: Dict[str, Any]) -> Dict[str, Any]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO datasources (
                name, description, type, owner_id, org_id, project_id, tags, status,
                created_by, updated_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8, $9, $9)
            RETURNING *
            """,
            payload["name"],
            payload.get("description"),
            payload["type"],
            payload.get("owner_id"),
            payload.get("org_id"),
            payload.get("project_id"),
            payload.get("tags", []),
            payload.get("status", "draft"),
            payload.get("created_by"),
        )
        return _row_to_datasource(row)


async def update_datasource(datasource_id: UUID, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    fields = []
    values: List[Any] = []

    mapping = {
        "name": "name",
        "description": "description",
        "owner_id": "owner_id",
        "org_id": "org_id",
        "project_id": "project_id",
        "tags": "tags",
        "status": "status",
        "updated_by": "updated_by",
    }

    for key, column in mapping.items():
        if key in payload:
            values.append(payload[key])
            if column == "tags":
                fields.append(f"{column} = ${len(values)}::text[]")
            else:
                fields.append(f"{column} = ${len(values)}")

    if not fields:
        return await get_datasource(datasource_id)

    values.extend([datetime.now(timezone.utc), datasource_id])
    set_sql = ", ".join(fields + [f"updated_at = ${len(values)-1}"])

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"UPDATE datasources SET {set_sql} WHERE id = ${len(values)} RETURNING *",
            *values,
        )
        if not row:
            return None
        # Fetch state join for completeness
        state = await conn.fetchrow(
            "SELECT * FROM datasource_state WHERE datasource_id = $1",
            datasource_id,
        )
        return _row_to_datasource(row, state)


async def archive_datasource(datasource_id: UUID, actor: Optional[str]) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            """
            UPDATE datasources
            SET status = 'disabled', archived_at = NOW(), updated_at = NOW(), updated_by = $2
            WHERE id = $1 AND archived_at IS NULL
            """,
            datasource_id,
            actor,
        )
        return result.endswith("1")


async def _next_version(conn: asyncpg.Connection, datasource_id: UUID) -> int:
    row = await conn.fetchrow(
        "SELECT COALESCE(MAX(version), 0) AS max_version FROM datasource_versions WHERE datasource_id = $1",
        datasource_id,
    )
    return int(row["max_version"]) + 1


async def create_version(
    datasource_id: UUID,
    config: Dict[str, Any],
    summary: Optional[str],
    actor: Optional[str],
) -> Dict[str, Any]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            version = await _next_version(conn, datasource_id)
            row = await conn.fetchrow(
                """
                INSERT INTO datasource_versions (datasource_id, version, state, config_json, summary, created_by)
                VALUES ($1, $2, 'draft', $3::jsonb, $4, $5)
                RETURNING *
                """,
                datasource_id,
                version,
                json.dumps(config),
                summary,
                actor,
            )
            await _record_event(
                conn,
                datasource_id,
                "create_version",
                actor,
                payload={"version": version, "summary": summary},
                version=version,
            )
            return _row_to_version(row)


async def list_versions(datasource_id: UUID, *, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT * FROM datasource_versions
            WHERE datasource_id = $1
            ORDER BY version DESC
            LIMIT $2 OFFSET $3
            """,
            datasource_id,
            limit,
            offset,
        )
        return [_row_to_version(row) for row in rows]


async def get_version(datasource_id: UUID, version: int) -> Optional[Dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM datasource_versions WHERE datasource_id = $1 AND version = $2",
            datasource_id,
            version,
        )
        if not row:
            return None
        return _row_to_version(row)


async def publish_version(
    datasource_id: UUID,
    version: int,
    actor: Optional[str],
    comment: Optional[str] = None,
) -> Dict[str, Any]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            version_row = await conn.fetchrow(
                "SELECT * FROM datasource_versions WHERE datasource_id = $1 AND version = $2",
                datasource_id,
                version,
            )
            if not version_row:
                raise ValueError("Version not found")

            await conn.execute(
                "UPDATE datasource_versions SET state = 'archived' WHERE datasource_id = $1 AND state = 'published'",
                datasource_id,
            )
            await conn.execute(
                """
                UPDATE datasource_versions
                SET state = 'published', approved_at = NOW(), approved_by = $3
                WHERE datasource_id = $1 AND version = $2
                """,
                datasource_id,
                version,
                actor,
            )

            await conn.execute(
                """
                INSERT INTO datasource_state (datasource_id, current_version, worker_status, updated_at)
                VALUES ($1, $2, 'starting', NOW())
                ON CONFLICT (datasource_id)
                DO UPDATE SET current_version = EXCLUDED.current_version,
                              worker_status = 'starting',
                              updated_at = NOW()
                """,
                datasource_id,
                version,
            )

            await conn.execute(
                """
                UPDATE datasources
                SET status = 'active', updated_at = NOW(), updated_by = $2
                WHERE id = $1
                """,
                datasource_id,
                actor,
            )

            await _record_event(
                conn,
                datasource_id,
                "publish",
                actor,
                payload={"version": version, "comment": comment},
                version=version,
            )

            return _row_to_version(version_row)


async def rollback_version(
    datasource_id: UUID,
    target_version: int,
    actor: Optional[str],
    comment: Optional[str] = None,
) -> Dict[str, Any]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            target = await conn.fetchrow(
                "SELECT * FROM datasource_versions WHERE datasource_id = $1 AND version = $2",
                datasource_id,
                target_version,
            )
            if not target:
                raise ValueError("Target version not found")

            await conn.execute(
                "UPDATE datasource_versions SET state = 'archived' WHERE datasource_id = $1 AND state = 'published'",
                datasource_id,
            )

            await conn.execute(
                """
                UPDATE datasource_versions
                SET state = 'published', approved_at = NOW(), approved_by = $3
                WHERE datasource_id = $1 AND version = $2
                """,
                datasource_id,
                target_version,
                actor,
            )

            await conn.execute(
                """
                INSERT INTO datasource_state (datasource_id, current_version, worker_status, updated_at)
                VALUES ($1, $2, 'starting', NOW())
                ON CONFLICT (datasource_id)
                DO UPDATE SET current_version = EXCLUDED.current_version,
                              worker_status = 'starting',
                              updated_at = NOW()
                """,
                datasource_id,
                target_version,
            )

            await conn.execute(
                """
                UPDATE datasources
                SET status = 'active', updated_at = NOW(), updated_by = $2
                WHERE id = $1
                """,
                datasource_id,
                actor,
            )

            await _record_event(
                conn,
                datasource_id,
                "rollback",
                actor,
                payload={"version": target_version, "comment": comment},
                version=target_version,
            )

            return _row_to_version(target)


async def record_test_run(
    datasource_id: UUID,
    actor: Optional[str],
    payload: Dict[str, Any],
    version: Optional[int] = None,
) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await _record_event(
            conn,
            datasource_id,
            "test_run",
            actor,
            payload=payload,
            version=version,
        )


async def list_events(
    datasource_id: UUID,
    *,
    limit: int = 50,
    offset: int = 0,
    event_types: Optional[Sequence[str]] = None,
) -> List[Dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if event_types:
            rows = await conn.fetch(
                """
                SELECT * FROM datasource_events
                WHERE datasource_id = $1 AND event_type = ANY($2::text[])
                ORDER BY created_at DESC
                LIMIT $3 OFFSET $4
                """,
                datasource_id,
                list(event_types),
                limit,
                offset,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT * FROM datasource_events
                WHERE datasource_id = $1
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
                """,
                datasource_id,
                limit,
                offset,
            )
        return [_row_to_event(row) for row in rows]


async def upsert_state(
    datasource_id: UUID,
    *,
    worker_status: Optional[str] = None,
    current_version: Optional[int] = None,
    last_heartbeat_at: Optional[datetime] = None,
    last_event_at: Optional[datetime] = None,
    error_code: Optional[str] = None,
    error_message: Optional[str] = None,
    metrics_snapshot: Optional[Dict[str, Any]] = None,
) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO datasource_state (
                datasource_id, current_version, worker_status, last_heartbeat_at, last_event_at,
                error_code, error_message, metrics_snapshot, updated_at
            )
            VALUES ($1, $2, COALESCE($3, 'running'), $4, $5, $6, $7, $8::jsonb, NOW())
            ON CONFLICT (datasource_id)
            DO UPDATE SET
                current_version = COALESCE(EXCLUDED.current_version, datasource_state.current_version),
                worker_status = COALESCE(EXCLUDED.worker_status, datasource_state.worker_status),
                last_heartbeat_at = COALESCE(EXCLUDED.last_heartbeat_at, datasource_state.last_heartbeat_at),
                last_event_at = COALESCE(EXCLUDED.last_event_at, datasource_state.last_event_at),
                error_code = EXCLUDED.error_code,
                error_message = EXCLUDED.error_message,
                metrics_snapshot = EXCLUDED.metrics_snapshot,
                updated_at = NOW()
            """,
            datasource_id,
            current_version,
            worker_status,
            last_heartbeat_at,
            last_event_at,
            error_code,
            error_message,
            json.dumps(metrics_snapshot) if metrics_snapshot is not None else None,
        )


async def get_secrets(datasource_id: UUID) -> List[Dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, datasource_id, key, version, created_at, created_by, rotated_at, rotated_by FROM datasource_secrets WHERE datasource_id = $1",
            datasource_id,
        )
        return [dict(row) for row in rows]


async def upsert_secret(
    datasource_id: UUID,
    key: str,
    encrypted_value: bytes,
    actor: Optional[str],
) -> Dict[str, Any]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO datasource_secrets (datasource_id, key, encrypted_value, version, created_by)
            VALUES ($1, $2, $3, 1, $4)
            ON CONFLICT (datasource_id, key)
            DO UPDATE SET
                encrypted_value = EXCLUDED.encrypted_value,
                version = datasource_secrets.version + 1,
                rotated_at = NOW(),
                rotated_by = $4
            RETURNING id, datasource_id, key, version, created_at, created_by, rotated_at, rotated_by
            """,
            datasource_id,
            key,
            encrypted_value,
            actor,
        )
        return dict(row)


async def get_secret_value(datasource_id: UUID, key: str) -> Optional[bytes]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT encrypted_value FROM datasource_secrets WHERE datasource_id = $1 AND key = $2",
            datasource_id,
            key,
        )
        if not row:
            return None
        return bytes(row["encrypted_value"])


async def delete_secret(datasource_id: UUID, key: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM datasource_secrets WHERE datasource_id = $1 AND key = $2",
            datasource_id,
            key,
        )
        return result.endswith("1")


async def _record_event(
    conn: asyncpg.Connection,
    datasource_id: UUID,
    event_type: str,
    actor: Optional[str],
    *,
    payload: Optional[Dict[str, Any]] = None,
    version: Optional[int] = None,
) -> None:
    await conn.execute(
        """
        INSERT INTO datasource_events (datasource_id, version, event_type, actor, payload)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        """,
        datasource_id,
        version,
        event_type,
        actor,
        json.dumps(payload) if payload is not None else None,
    )


async def record_event(
    datasource_id: UUID,
    event_type: str,
    actor: Optional[str],
    *,
    payload: Optional[Dict[str, Any]] = None,
    version: Optional[int] = None,
) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await _record_event(conn, datasource_id, event_type, actor, payload=payload, version=version)
