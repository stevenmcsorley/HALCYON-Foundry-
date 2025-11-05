"""Repository functions for Cases & Ownership."""
import asyncpg
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
        "created_at, updated_at, resolved_at FROM cases WHERE id = $1",
        case_id,
    )
    return dict(row) if row else None


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
               created_at, updated_at, resolved_at
        FROM cases
        {where_clause}
        ORDER BY created_at DESC
        LIMIT ${param_idx} OFFSET ${param_idx + 1}
        """,
        *params,
    )
    return [dict(row) for row in rows]


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
