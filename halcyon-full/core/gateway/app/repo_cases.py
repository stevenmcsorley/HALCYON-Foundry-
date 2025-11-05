"""Repository functions for Cases & Ownership."""
import asyncpg
import json
from typing import Optional, Dict, Any, List
from datetime import datetime
from .models_cases import CaseCreate, CaseUpdate, CaseNoteCreate


async def create_case(conn: asyncpg.Connection, data: CaseCreate, created_by: Optional[str]) -> Dict[str, Any]:
    """Create a new case."""
    row = await conn.fetchrow(
        """
        INSERT INTO cases (title, description, status, priority, owner, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, title, description, status, priority, owner, created_by,
                  created_at, updated_at, resolved_at
        """,
        data.title,
        data.description,
        data.status,
        data.priority,
        data.owner,
        created_by,
    )
    return dict(row)


async def update_case(conn: asyncpg.Connection, case_id: int, data: CaseUpdate) -> Optional[Dict[str, Any]]:
    """Update a case. Auto-sets updated_at; sets resolved_at when status becomes resolved|closed."""
    updates = []
    params = []
    param_idx = 1

    if data.title is not None:
        updates.append(f"title = ${param_idx}")
        params.append(data.title)
        param_idx += 1
    if data.description is not None:
        updates.append(f"description = ${param_idx}")
        params.append(data.description)
        param_idx += 1
    if data.status is not None:
        updates.append(f"status = ${param_idx}")
        params.append(data.status)
        param_idx += 1
        # Auto-set resolved_at when status becomes resolved|closed
        if data.status in ("resolved", "closed"):
            updates.append(f"resolved_at = COALESCE(resolved_at, now())")
        else:
            updates.append(f"resolved_at = NULL")
    if data.priority is not None:
        updates.append(f"priority = ${param_idx}")
        params.append(data.priority)
        param_idx += 1
    if data.owner is not None:
        updates.append(f"owner = ${param_idx}")
        params.append(data.owner)
        param_idx += 1

    if not updates:
        # No changes, just fetch current state
        row = await conn.fetchrow(
            "SELECT id, title, description, status, priority, owner, created_by, "
            "created_at, updated_at, resolved_at FROM cases WHERE id = $1",
            case_id,
        )
        return dict(row) if row else None

    updates.append("updated_at = now()")
    params.append(case_id)

    row = await conn.fetchrow(
        f"""
        UPDATE cases
        SET {', '.join(updates)}
        WHERE id = ${param_idx}
        RETURNING id, title, description, status, priority, owner, created_by,
                  created_at, updated_at, resolved_at
        """,
        *params,
    )
    return dict(row) if row else None


async def get_case(conn: asyncpg.Connection, case_id: int) -> Optional[Dict[str, Any]]:
    """Get a case by ID."""
    row = await conn.fetchrow(
        "SELECT id, title, description, status, priority, owner, created_by, "
        "created_at, updated_at, resolved_at, "
        "priority_suggestion, owner_suggestion, similar_case_ids, ml_version "
        "FROM cases WHERE id = $1",
        case_id,
    )
    if not row:
        return None
    result = dict(row)
    # Parse JSONB similar_case_ids to list (asyncpg may return as list or str)
    if result.get("similar_case_ids") is None:
        result["similar_case_ids"] = []
    elif isinstance(result["similar_case_ids"], str):
        try:
            result["similar_case_ids"] = json.loads(result["similar_case_ids"])
        except (json.JSONDecodeError, TypeError):
            result["similar_case_ids"] = []
    # asyncpg may already return as list, so we're good
    return result


async def list_cases(
    conn: asyncpg.Connection,
    status: Optional[str] = None,
    owner: Optional[str] = None,
    priority: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    """List cases with filters."""
    conditions = []
    params = []
    param_idx = 1

    if status:
        conditions.append(f"status = ${param_idx}")
        params.append(status)
        param_idx += 1
    if owner:
        conditions.append(f"owner = ${param_idx}")
        params.append(owner)
        param_idx += 1
    if priority:
        conditions.append(f"priority = ${param_idx}")
        params.append(priority)
        param_idx += 1
    if search:
        conditions.append(f"(title ILIKE ${param_idx} OR description ILIKE ${param_idx})")
        search_term = f"%{search}%"
        params.append(search_term)
        params.append(search_term)
        param_idx += 2

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    params.extend([limit, offset])
    rows = await conn.fetch(
        f"""
        SELECT id, title, description, status, priority, owner, created_by,
               created_at, updated_at, resolved_at,
               priority_suggestion, owner_suggestion, similar_case_ids, ml_version
        FROM cases
        {where_clause}
        ORDER BY created_at DESC
        LIMIT ${param_idx} OFFSET ${param_idx + 1}
        """,
        *params,
    )
    results = []
    for row in rows:
        result = dict(row)
        # Parse JSONB similar_case_ids to list (asyncpg may return as list or str)
        if result.get("similar_case_ids") is None:
            result["similar_case_ids"] = []
        elif isinstance(result["similar_case_ids"], str):
            try:
                result["similar_case_ids"] = json.loads(result["similar_case_ids"])
            except (json.JSONDecodeError, TypeError):
                result["similar_case_ids"] = []
        # asyncpg may already return as list, so we're good
        results.append(result)
    return results


async def add_case_note(
    conn: asyncpg.Connection, case_id: int, data: CaseNoteCreate, author: Optional[str]
) -> Dict[str, Any]:
    """Add a note to a case."""
    row = await conn.fetchrow(
        """
        INSERT INTO case_notes (case_id, author, body)
        VALUES ($1, $2, $3)
        RETURNING id, case_id, author, body, created_at
        """,
        case_id,
        author,
        data.body,
    )
    return dict(row)


async def list_case_notes(conn: asyncpg.Connection, case_id: int) -> List[Dict[str, Any]]:
    """List notes for a case."""
    rows = await conn.fetch(
        "SELECT id, case_id, author, body, created_at "
        "FROM case_notes WHERE case_id = $1 ORDER BY created_at ASC",
        case_id,
    )
    return [dict(row) for row in rows]


async def assign_alerts_to_case(
    conn: asyncpg.Connection, case_id: int, alert_ids: List[int]
) -> int:
    """Assign alerts to a case. Returns count of updated alerts."""
    result = await conn.execute(
        """
        UPDATE alerts
        SET case_id = $1
        WHERE id = ANY($2::int[])
        """,
        case_id,
        alert_ids,
    )
    # Parse "UPDATE N" to get count
    return int(result.split()[-1]) if result else 0


async def get_owner_history_counts(conn: asyncpg.Connection, limit: int = 500) -> Dict[str, int]:
    """Return mapping of owner->count for resolved/closed cases."""
    rows = await conn.fetch(
        """
        SELECT owner, COUNT(*) cnt
        FROM cases
        WHERE owner IS NOT NULL AND status IN ('resolved', 'closed')
        GROUP BY owner
        ORDER BY cnt DESC
        LIMIT $1
        """,
        limit,
    )
    return {r["owner"]: r["cnt"] for r in rows}


async def get_recent_cases_for_similarity(conn: asyncpg.Connection, limit: int = 200) -> List[Dict[str, Any]]:
    """Get recent cases for similarity matching."""
    rows = await conn.fetch(
        """
        SELECT id, title
        FROM cases
        WHERE status IN ('open', 'in_progress', 'resolved', 'closed')
        ORDER BY id DESC
        LIMIT $1
        """,
        limit,
    )
    return [{"id": r["id"], "title": r["title"]} for r in rows]
