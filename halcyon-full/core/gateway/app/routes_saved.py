from fastapi import APIRouter, HTTPException, Depends, Request
from typing import List, Optional, Set
from uuid import UUID
import asyncpg
import json
from .db import get_pool
from .models import (
    SavedQuery, SavedQueryCreate, SavedQueryUpdate,
    Dashboard, DashboardCreate, DashboardUpdate,
    DashboardPanel, DashboardPanelCreate, DashboardPanelUpdate,
    DashboardWithPanels
)

router = APIRouter(prefix="/saved-queries", tags=["saved-queries"])


def get_owner(request: Request) -> str:
    """Extract owner (user sub) from request state."""
    user = getattr(request.state, "user", None)
    if not user:
        return "anonymous"
    return user.get("sub", "anonymous")


# Saved Queries routes

@router.get("", response_model=List[SavedQuery])
async def list_saved_queries(request: Request):
    """List all saved queries for the current user."""
    owner = get_owner(request)
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, name, owner, gql, shape_hint, created_at, updated_at FROM saved_queries WHERE owner = $1 ORDER BY updated_at DESC",
            owner
        )
        return [SavedQuery(**dict(row)) for row in rows]


@router.post("", response_model=SavedQuery, status_code=201)
async def create_saved_query(query: SavedQueryCreate, request: Request):
    """Create a new saved query."""
    owner = get_owner(request)
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            row = await conn.fetchrow(
                """
                INSERT INTO saved_queries (name, owner, gql, shape_hint)
                VALUES ($1, $2, $3, $4)
                RETURNING id, name, owner, gql, shape_hint, created_at, updated_at
                """,
                query.name, owner, query.gql, query.shape_hint
            )
            return SavedQuery(**dict(row))
        except asyncpg.UniqueViolationError:
            raise HTTPException(status_code=409, detail="Query with this name already exists")


@router.get("/{query_id}", response_model=SavedQuery)
async def get_saved_query(query_id: UUID, request: Request):
    """Get a saved query by ID."""
    owner = get_owner(request)
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, name, owner, gql, shape_hint, created_at, updated_at FROM saved_queries WHERE id = $1 AND owner = $2",
            query_id, owner
        )
        if not row:
            raise HTTPException(status_code=404, detail="Query not found")
        return SavedQuery(**dict(row))


@router.put("/{query_id}", response_model=SavedQuery)
async def update_saved_query(query_id: UUID, query: SavedQueryUpdate, request: Request):
    """Update a saved query."""
    owner = get_owner(request)
    pool = await get_pool()
    async with pool.acquire() as conn:
        updates = []
        values = []
        pos = 1
        if query.name is not None:
            updates.append(f"name = ${pos}")
            values.append(query.name)
            pos += 1
        if query.gql is not None:
            updates.append(f"gql = ${pos}")
            values.append(query.gql)
            pos += 1
        if query.shape_hint is not None:
            updates.append(f"shape_hint = ${pos}")
            values.append(query.shape_hint)
            pos += 1
        
        if not updates:
            # Just fetch and return existing
            row = await conn.fetchrow(
                "SELECT id, name, owner, gql, shape_hint, created_at, updated_at FROM saved_queries WHERE id = $1 AND owner = $2",
                query_id, owner
            )
            if not row:
                raise HTTPException(status_code=404, detail="Query not found")
            return SavedQuery(**dict(row))
        
        updates.append(f"updated_at = CURRENT_TIMESTAMP")
        values.extend([query_id, owner])
        
        row = await conn.fetchrow(
            f"""
            UPDATE saved_queries
            SET {', '.join(updates)}
            WHERE id = ${pos} AND owner = ${pos + 1}
            RETURNING id, name, owner, gql, shape_hint, created_at, updated_at
            """,
            *values
        )
        if not row:
            raise HTTPException(status_code=404, detail="Query not found")
        return SavedQuery(**dict(row))


@router.delete("/{query_id}", status_code=204)
async def delete_saved_query(query_id: UUID, request: Request):
    """Delete a saved query."""
    owner = get_owner(request)
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM saved_queries WHERE id = $1 AND owner = $2",
            query_id, owner
        )
        if result == "DELETE 0":
            raise HTTPException(status_code=404, detail="Query not found")


# Dashboards routes

dashboard_router = APIRouter(prefix="/dashboards", tags=["dashboards"])


@dashboard_router.get("", response_model=List[Dashboard])
async def list_dashboards(request: Request):
    """List all dashboards for the current user."""
    owner = get_owner(request)
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, name, owner, created_at, updated_at, config, is_default
            FROM dashboards
            WHERE owner = $1
            ORDER BY updated_at DESC
            """,
            owner
        )

        dashboards = []
        for row in rows:
            data = dict(row)
            config_val = data.get("config")
            if isinstance(config_val, str):
                try:
                    data["config"] = json.loads(config_val)
                except json.JSONDecodeError:
                    data["config"] = {}
            elif config_val is None:
                data["config"] = {}

            dashboards.append(Dashboard(**data))

        return dashboards


@dashboard_router.post("", response_model=Dashboard, status_code=201)
async def create_dashboard(dashboard: DashboardCreate, request: Request):
    """Create a new dashboard."""
    owner = get_owner(request)
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            config_json = json.dumps(dashboard.config or {})
            if dashboard.is_default:
                await conn.execute(
                    "UPDATE dashboards SET is_default = FALSE WHERE owner = $1",
                    owner
                )
            row = await conn.fetchrow(
                """
                INSERT INTO dashboards (name, owner, config, is_default)
                VALUES ($1, $2, $3::jsonb, $4)
                RETURNING id, name, owner, created_at, updated_at, config, is_default
                """,
                dashboard.name, owner, config_json, dashboard.is_default
            )
            return Dashboard(**dict(row))
        except asyncpg.UniqueViolationError:
            raise HTTPException(status_code=409, detail="Dashboard with this name already exists")


@dashboard_router.get("/{dashboard_id}", response_model=DashboardWithPanels)
async def get_dashboard(dashboard_id: UUID, request: Request):
    """Get a dashboard with its panels."""
    owner = get_owner(request)
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Get dashboard
        row = await conn.fetchrow(
            "SELECT id, name, owner, created_at, updated_at, config, is_default FROM dashboards WHERE id = $1 AND owner = $2",
            dashboard_id, owner
        )
        if not row:
            raise HTTPException(status_code=404, detail="Dashboard not found")

        dashboard_data = dict(row)
        config_val = dashboard_data.get("config")
        if isinstance(config_val, str):
            try:
                dashboard_data["config"] = json.loads(config_val)
            except json.JSONDecodeError:
                dashboard_data["config"] = {}
        elif config_val is None:
            dashboard_data["config"] = {}

        dashboard = Dashboard(**dashboard_data)
        
        # Get panels
        panel_rows = await conn.fetch(
            """
            SELECT id, dashboard_id, title, type, config_json, created_at, updated_at, position
            FROM dashboard_panels
            WHERE dashboard_id = $1
            ORDER BY position, created_at
            """,
            dashboard_id
        )
        panels = []
        for p_row in panel_rows:
            p_dict = dict(p_row)
            config_json_val = p_dict.get("config_json")
            if isinstance(config_json_val, str):
                try:
                    p_dict["config_json"] = json.loads(config_json_val)
                except json.JSONDecodeError:
                    p_dict["config_json"] = {}
            elif config_json_val is None:
                p_dict["config_json"] = {}
            panels.append(DashboardPanel(**p_dict))
        
        return DashboardWithPanels(**dashboard.model_dump(), panels=panels)


@dashboard_router.put("/{dashboard_id}", response_model=Dashboard)
async def update_dashboard(dashboard_id: UUID, dashboard: DashboardUpdate, request: Request):
    """Update a dashboard."""
    owner = get_owner(request)
    pool = await get_pool()
    async with pool.acquire() as conn:
        updates = []
        values = []
        pos = 1

        if dashboard.name is not None:
            updates.append(f"name = ${pos}")
            values.append(dashboard.name)
            pos += 1

        if dashboard.config is not None:
            updates.append(f"config = ${pos}::jsonb")
            values.append(json.dumps(dashboard.config or {}))
            pos += 1

        if dashboard.is_default is not None:
            updates.append(f"is_default = ${pos}")
            values.append(dashboard.is_default)
            pos += 1

        if not updates:
            row = await conn.fetchrow(
                "SELECT id, name, owner, created_at, updated_at, config, is_default FROM dashboards WHERE id = $1 AND owner = $2",
                dashboard_id, owner
            )
            if not row:
                raise HTTPException(status_code=404, detail="Dashboard not found")
            return Dashboard(**dict(row))

        # If setting as default, clear other defaults first
        if dashboard.is_default:
            await conn.execute(
                "UPDATE dashboards SET is_default = FALSE WHERE owner = $1",
                owner
            )

        updates.append(f"updated_at = CURRENT_TIMESTAMP")
        values.extend([dashboard_id, owner])

        row = await conn.fetchrow(
            f"""
            UPDATE dashboards
            SET {', '.join(updates)}
            WHERE id = ${pos} AND owner = ${pos + 1}
            RETURNING id, name, owner, created_at, updated_at, config, is_default
            """,
            *values
        )
        if not row:
            raise HTTPException(status_code=404, detail="Dashboard not found")
        return Dashboard(**dict(row))


@dashboard_router.post("/{dashboard_id}/set-default", status_code=204)
async def set_default_dashboard(dashboard_id: UUID, request: Request):
    """Mark a dashboard as the default for the owner."""
    owner = get_owner(request)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT id FROM dashboards WHERE id = $1 AND owner = $2",
                dashboard_id, owner
            )
            if not row:
                raise HTTPException(status_code=404, detail="Dashboard not found")

            await conn.execute(
                "UPDATE dashboards SET is_default = FALSE WHERE owner = $1",
                owner
            )

            await conn.execute(
                "UPDATE dashboards SET is_default = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND owner = $2",
                dashboard_id, owner
            )

    return None


@dashboard_router.delete("/{dashboard_id}", status_code=204)
async def delete_dashboard(dashboard_id: UUID, request: Request):
    """Delete a dashboard (cascades to panels)."""
    owner = get_owner(request)
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM dashboards WHERE id = $1 AND owner = $2",
            dashboard_id, owner
        )
        if result == "DELETE 0":
            raise HTTPException(status_code=404, detail="Dashboard not found")


# Dashboard Panels routes

@dashboard_router.post("/{dashboard_id}/panels", response_model=DashboardPanel, status_code=201)
async def create_panel(dashboard_id: UUID, panel: DashboardPanelCreate, request: Request):
    """Create a panel in a dashboard."""
    owner = get_owner(request)
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Verify dashboard ownership
        dash_row = await conn.fetchrow(
            "SELECT id FROM dashboards WHERE id = $1 AND owner = $2",
            dashboard_id, owner
        )
        if not dash_row:
            raise HTTPException(status_code=404, detail="Dashboard not found")
        
        query_id = panel.config_json.get("queryId") if panel.config_json else None
        if query_id:
            query_row = await conn.fetchrow(
                "SELECT shape_hint FROM saved_queries WHERE id = $1 AND owner = $2",
                query_id, owner
            )
            if not query_row:
                raise HTTPException(status_code=400, detail="Query not found or not owned by user")
            shape_hint = query_row["shape_hint"]
            if not _is_shape_compatible(panel.type, shape_hint):
                allowed = ", ".join(sorted(ALLOWED_PANEL_SHAPES.get(panel.type, {'unknown'})))
                raise HTTPException(
                    status_code=400,
                    detail=f"Query shape '{shape_hint}' is incompatible with panel type '{panel.type}'. Allowed shapes: {allowed}"
                )
        
        row = await conn.fetchrow(
            """
            INSERT INTO dashboard_panels (dashboard_id, title, type, config_json, position)
            VALUES ($1, $2, $3, $4::jsonb, $5)
            RETURNING id, dashboard_id, title, type, config_json, created_at, updated_at, position
            """,
            dashboard_id, panel.title, panel.type, json.dumps(panel.config_json), panel.position
        )
        p_dict = dict(row)
        p_dict["config_json"] = json.loads(p_dict["config_json"]) if isinstance(p_dict["config_json"], str) else p_dict["config_json"]
        return DashboardPanel(**p_dict)


@dashboard_router.put("/{dashboard_id}/panels/{panel_id}", response_model=DashboardPanel)
async def update_panel(dashboard_id: UUID, panel_id: UUID, panel: DashboardPanelUpdate, request: Request):
    """Update a panel."""
    owner = get_owner(request)
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Verify dashboard ownership
        dash_row = await conn.fetchrow(
            "SELECT id FROM dashboards WHERE id = $1 AND owner = $2",
            dashboard_id, owner
        )
        if not dash_row:
            raise HTTPException(status_code=404, detail="Dashboard not found")
        
        updates = []
        values = []
        pos = 1
        if panel.title is not None:
            updates.append(f"title = ${pos}")
            values.append(panel.title)
            pos += 1
        if panel.type is not None:
            updates.append(f"type = ${pos}")
            values.append(panel.type)
            pos += 1
        if panel.config_json is not None:
            updates.append(f"config_json = ${pos}::jsonb")
            values.append(json.dumps(panel.config_json))
            pos += 1
        if panel.position is not None:
            updates.append(f"position = ${pos}")
            values.append(panel.position)
            pos += 1
        
        if not updates:
            row = await conn.fetchrow(
                """
                SELECT id, dashboard_id, title, type, config_json, created_at, updated_at, position
                FROM dashboard_panels
                WHERE id = $1 AND dashboard_id = $2
                """,
                panel_id, dashboard_id
            )
            if not row:
                raise HTTPException(status_code=404, detail="Panel not found")
            p_dict = dict(row)
            p_dict["config_json"] = json.loads(p_dict["config_json"]) if isinstance(p_dict["config_json"], str) else p_dict["config_json"]
            return DashboardPanel(**p_dict)
        
        # Validate query assignment if provided
        if panel.config_json and "queryId" in panel.config_json:
            query_id = panel.config_json.get("queryId")
            if query_id:
                query_row = await conn.fetchrow(
                    "SELECT shape_hint FROM saved_queries WHERE id = $1 AND owner = $2",
                    query_id, owner
                )
                if not query_row:
                    raise HTTPException(status_code=400, detail="Query not found or not owned by user")
                shape_hint = query_row["shape_hint"]
                existing_row = await conn.fetchrow(
                    "SELECT type FROM dashboard_panels WHERE id = $1 AND dashboard_id = $2",
                    panel_id, dashboard_id
                )
                if not existing_row:
                    raise HTTPException(status_code=404, detail="Panel not found")
                panel_type = panel.type or existing_row["type"]
                if not _is_shape_compatible(panel_type, shape_hint):
                    allowed = ", ".join(sorted(ALLOWED_PANEL_SHAPES.get(panel_type, {'unknown'})))
                    raise HTTPException(
                        status_code=400,
                        detail=f"Query shape '{shape_hint}' is incompatible with panel type '{panel_type}'. Allowed shapes: {allowed}"
                    )

        updates.append(f"updated_at = CURRENT_TIMESTAMP")
        values.extend([panel_id, dashboard_id])
        
        row = await conn.fetchrow(
            f"""
            UPDATE dashboard_panels
            SET {', '.join(updates)}
            WHERE id = ${pos} AND dashboard_id = ${pos + 1}
            RETURNING id, dashboard_id, title, type, config_json, created_at, updated_at, position
            """,
            *values
        )
        if not row:
            raise HTTPException(status_code=404, detail="Panel not found")
        p_dict = dict(row)
        p_dict["config_json"] = json.loads(p_dict["config_json"]) if isinstance(p_dict["config_json"], str) else p_dict["config_json"]
        return DashboardPanel(**p_dict)


@dashboard_router.delete("/{dashboard_id}/panels/{panel_id}", status_code=204)
async def delete_panel(dashboard_id: UUID, panel_id: UUID, request: Request):
    """Delete a panel."""
    owner = get_owner(request)
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Verify dashboard ownership
        dash_row = await conn.fetchrow(
            "SELECT id FROM dashboards WHERE id = $1 AND owner = $2",
            dashboard_id, owner
        )
        if not dash_row:
            raise HTTPException(status_code=404, detail="Dashboard not found")
        
        result = await conn.execute(
            "DELETE FROM dashboard_panels WHERE id = $1 AND dashboard_id = $2",
            panel_id, dashboard_id
        )
        if result == "DELETE 0":
            raise HTTPException(status_code=404, detail="Panel not found")
