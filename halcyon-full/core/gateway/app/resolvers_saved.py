from ariadne import QueryType, MutationType
from uuid import UUID
from .db import get_pool
from .models import (
    SavedQueryCreate, SavedQueryUpdate,
    DashboardCreate, DashboardUpdate,
    DashboardPanelCreate, DashboardPanelUpdate
)
import json
import asyncpg

saved_query = QueryType()
saved_mutation = MutationType()


def get_owner_from_context(context):
    """Extract owner from GraphQL context."""
    user = context.get("user", {})
    return user.get("sub", "anonymous")


@saved_query.field("savedQueries")
async def resolve_saved_queries(obj, info):
    """List all saved queries for current user."""
    owner = get_owner_from_context(info.context)
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, name, owner, gql, shape_hint, created_at, updated_at FROM saved_queries WHERE owner = $1 ORDER BY updated_at DESC",
            owner
        )
        return [
            {
                "id": str(row["id"]),
                "name": row["name"],
                "owner": row["owner"],
                "gql": row["gql"],
                "shapeHint": row["shape_hint"],
                "createdAt": row["created_at"].isoformat(),
                "updatedAt": row["updated_at"].isoformat(),
            }
            for row in rows
        ]


@saved_query.field("savedQuery")
async def resolve_saved_query(obj, info, id: str):
    """Get a saved query by ID."""
    owner = get_owner_from_context(info.context)
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, name, owner, gql, shape_hint, created_at, updated_at FROM saved_queries WHERE id = $1 AND owner = $2",
            UUID(id), owner
        )
        if not row:
            return None
        return {
            "id": str(row["id"]),
            "name": row["name"],
            "owner": row["owner"],
            "gql": row["gql"],
            "shapeHint": row["shape_hint"],
            "createdAt": row["created_at"].isoformat(),
            "updatedAt": row["updated_at"].isoformat(),
        }


@saved_query.field("dashboards")
async def resolve_dashboards(obj, info):
    """List all dashboards for current user."""
    owner = get_owner_from_context(info.context)
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, name, owner, created_at, updated_at FROM dashboards WHERE owner = $1 ORDER BY updated_at DESC",
            owner
        )
        return [
            {
                "id": str(row["id"]),
                "name": row["name"],
                "owner": row["owner"],
                "createdAt": row["created_at"].isoformat(),
                "updatedAt": row["updated_at"].isoformat(),
            }
            for row in rows
        ]


@saved_query.field("dashboard")
async def resolve_dashboard(obj, info, id: str):
    """Get a dashboard with panels."""
    owner = get_owner_from_context(info.context)
    pool = await get_pool()
    async with pool.acquire() as conn:
        dash_row = await conn.fetchrow(
            "SELECT id, name, owner, created_at, updated_at FROM dashboards WHERE id = $1 AND owner = $2",
            UUID(id), owner
        )
        if not dash_row:
            return None
        
        panel_rows = await conn.fetch(
            """
            SELECT id, dashboard_id, title, type, config_json, created_at, updated_at, position
            FROM dashboard_panels
            WHERE dashboard_id = $1
            ORDER BY position, created_at
            """,
            UUID(id)
        )
        panels = []
        for p_row in panel_rows:
            config = p_row["config_json"]
            if isinstance(config, str):
                config = json.loads(config)
            panels.append({
                "id": str(p_row["id"]),
                "dashboardId": str(p_row["dashboard_id"]),
                "title": p_row["title"],
                "type": p_row["type"],
                "config": config,
                "position": p_row["position"],
                "createdAt": p_row["created_at"].isoformat(),
                "updatedAt": p_row["updated_at"].isoformat(),
            })
        
        return {
            "id": str(dash_row["id"]),
            "name": dash_row["name"],
            "owner": dash_row["owner"],
            "createdAt": dash_row["created_at"].isoformat(),
            "updatedAt": dash_row["updated_at"].isoformat(),
            "panels": panels,
        }


@saved_mutation.field("createSavedQuery")
async def resolve_create_saved_query(obj, info, input):
    """Create a new saved query."""
    owner = get_owner_from_context(info.context)
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            row = await conn.fetchrow(
                """
                INSERT INTO saved_queries (name, owner, gql, shape_hint)
                VALUES ($1, $2, $3, $4)
                RETURNING id, name, owner, gql, shape_hint, created_at, updated_at
                """,
                input["name"], owner, input["gql"], input.get("shapeHint")
            )
            return {
                "id": str(row["id"]),
                "name": row["name"],
                "owner": row["owner"],
                "gql": row["gql"],
                "shapeHint": row["shape_hint"],
                "createdAt": row["created_at"].isoformat(),
                "updatedAt": row["updated_at"].isoformat(),
            }
        except asyncpg.UniqueViolationError:
            raise ValueError("Query with this name already exists")


@saved_mutation.field("updateSavedQuery")
async def resolve_update_saved_query(obj, info, id: str, input):
    """Update a saved query."""
    owner = get_owner_from_context(info.context)
    pool = await get_pool()
    async with pool.acquire() as conn:
        updates = []
        values = []
        pos = 1
        if input.get("name") is not None:
            updates.append(f"name = ${pos}")
            values.append(input["name"])
            pos += 1
        if input.get("gql") is not None:
            updates.append(f"gql = ${pos}")
            values.append(input["gql"])
            pos += 1
        if input.get("shapeHint") is not None:
            updates.append(f"shape_hint = ${pos}")
            values.append(input["shapeHint"])
            pos += 1
        
        if not updates:
            row = await conn.fetchrow(
                "SELECT id, name, owner, gql, shape_hint, created_at, updated_at FROM saved_queries WHERE id = $1 AND owner = $2",
                UUID(id), owner
            )
            if not row:
                raise ValueError("Query not found")
            return {
                "id": str(row["id"]),
                "name": row["name"],
                "owner": row["owner"],
                "gql": row["gql"],
                "shapeHint": row["shape_hint"],
                "createdAt": row["created_at"].isoformat(),
                "updatedAt": row["updated_at"].isoformat(),
            }
        
        updates.append("updated_at = CURRENT_TIMESTAMP")
        values.extend([UUID(id), owner])
        
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
            raise ValueError("Query not found")
        return {
            "id": str(row["id"]),
            "name": row["name"],
            "owner": row["owner"],
            "gql": row["gql"],
            "shapeHint": row["shape_hint"],
            "createdAt": row["created_at"].isoformat(),
            "updatedAt": row["updated_at"].isoformat(),
        }


@saved_mutation.field("deleteSavedQuery")
async def resolve_delete_saved_query(obj, info, id: str):
    """Delete a saved query."""
    owner = get_owner_from_context(info.context)
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM saved_queries WHERE id = $1 AND owner = $2",
            UUID(id), owner
        )
        return result != "DELETE 0"


@saved_mutation.field("createDashboard")
async def resolve_create_dashboard(obj, info, input):
    """Create a new dashboard."""
    owner = get_owner_from_context(info.context)
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            row = await conn.fetchrow(
                """
                INSERT INTO dashboards (name, owner)
                VALUES ($1, $2)
                RETURNING id, name, owner, created_at, updated_at
                """,
                input["name"], owner
            )
            return {
                "id": str(row["id"]),
                "name": row["name"],
                "owner": row["owner"],
                "createdAt": row["created_at"].isoformat(),
                "updatedAt": row["updated_at"].isoformat(),
            }
        except asyncpg.UniqueViolationError:
            raise ValueError("Dashboard with this name already exists")


@saved_mutation.field("updateDashboard")
async def resolve_update_dashboard(obj, info, id: str, input):
    """Update a dashboard."""
    owner = get_owner_from_context(info.context)
    pool = await get_pool()
    async with pool.acquire() as conn:
        if input.get("name") is None:
            row = await conn.fetchrow(
                "SELECT id, name, owner, created_at, updated_at FROM dashboards WHERE id = $1 AND owner = $2",
                UUID(id), owner
            )
            if not row:
                raise ValueError("Dashboard not found")
            return {
                "id": str(row["id"]),
                "name": row["name"],
                "owner": row["owner"],
                "createdAt": row["created_at"].isoformat(),
                "updatedAt": row["updated_at"].isoformat(),
            }
        
        row = await conn.fetchrow(
            """
            UPDATE dashboards
            SET name = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2 AND owner = $3
            RETURNING id, name, owner, created_at, updated_at
            """,
            input["name"], UUID(id), owner
        )
        if not row:
            raise ValueError("Dashboard not found")
        return {
            "id": str(row["id"]),
            "name": row["name"],
            "owner": row["owner"],
            "createdAt": row["created_at"].isoformat(),
            "updatedAt": row["updated_at"].isoformat(),
        }


@saved_mutation.field("deleteDashboard")
async def resolve_delete_dashboard(obj, info, id: str):
    """Delete a dashboard."""
    owner = get_owner_from_context(info.context)
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM dashboards WHERE id = $1 AND owner = $2",
            UUID(id), owner
        )
        return result != "DELETE 0"


@saved_mutation.field("createPanel")
async def resolve_create_panel(obj, info, dashboardId: str, input):
    """Create a panel in a dashboard."""
    owner = get_owner_from_context(info.context)
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Verify dashboard ownership
        dash_row = await conn.fetchrow(
            "SELECT id FROM dashboards WHERE id = $1 AND owner = $2",
            UUID(dashboardId), owner
        )
        if not dash_row:
            raise ValueError("Dashboard not found")
        
        row = await conn.fetchrow(
            """
            INSERT INTO dashboard_panels (dashboard_id, title, type, config_json, position)
            VALUES ($1, $2, $3, $4::jsonb, $5)
            RETURNING id, dashboard_id, title, type, config_json, created_at, updated_at, position
            """,
            UUID(dashboardId), input["title"], input["type"],
            json.dumps(input.get("config", {})), input.get("position", 0)
        )
        config = row["config_json"]
        if isinstance(config, str):
            config = json.loads(config)
        return {
            "id": str(row["id"]),
            "dashboardId": str(row["dashboard_id"]),
            "title": row["title"],
            "type": row["type"],
            "config": config,
            "position": row["position"],
            "createdAt": row["created_at"].isoformat(),
            "updatedAt": row["updated_at"].isoformat(),
        }


@saved_mutation.field("updatePanel")
async def resolve_update_panel(obj, info, dashboardId: str, panelId: str, input):
    """Update a panel."""
    owner = get_owner_from_context(info.context)
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Verify dashboard ownership
        dash_row = await conn.fetchrow(
            "SELECT id FROM dashboards WHERE id = $1 AND owner = $2",
            UUID(dashboardId), owner
        )
        if not dash_row:
            raise ValueError("Dashboard not found")
        
        updates = []
        values = []
        pos = 1
        if input.get("title") is not None:
            updates.append(f"title = ${pos}")
            values.append(input["title"])
            pos += 1
        if input.get("type") is not None:
            updates.append(f"type = ${pos}")
            values.append(input["type"])
            pos += 1
        if input.get("config") is not None:
            updates.append(f"config_json = ${pos}::jsonb")
            values.append(json.dumps(input["config"]))
            pos += 1
        if input.get("position") is not None:
            updates.append(f"position = ${pos}")
            values.append(input["position"])
            pos += 1
        
        if not updates:
            row = await conn.fetchrow(
                """
                SELECT id, dashboard_id, title, type, config_json, created_at, updated_at, position
                FROM dashboard_panels
                WHERE id = $1 AND dashboard_id = $2
                """,
                UUID(panelId), UUID(dashboardId)
            )
            if not row:
                raise ValueError("Panel not found")
            config = row["config_json"]
            if isinstance(config, str):
                config = json.loads(config)
            return {
                "id": str(row["id"]),
                "dashboardId": str(row["dashboard_id"]),
                "title": row["title"],
                "type": row["type"],
                "config": config,
                "position": row["position"],
                "createdAt": row["created_at"].isoformat(),
                "updatedAt": row["updated_at"].isoformat(),
            }
        
        updates.append("updated_at = CURRENT_TIMESTAMP")
        values.extend([UUID(panelId), UUID(dashboardId)])
        
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
            raise ValueError("Panel not found")
        config = row["config_json"]
        if isinstance(config, str):
            config = json.loads(config)
        return {
            "id": str(row["id"]),
            "dashboardId": str(row["dashboard_id"]),
            "title": row["title"],
            "type": row["type"],
            "config": config,
            "position": row["position"],
            "createdAt": row["created_at"].isoformat(),
            "updatedAt": row["updated_at"].isoformat(),
        }


@saved_mutation.field("deletePanel")
async def resolve_delete_panel(obj, info, dashboardId: str, panelId: str):
    """Delete a panel."""
    owner = get_owner_from_context(info.context)
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Verify dashboard ownership
        dash_row = await conn.fetchrow(
            "SELECT id FROM dashboards WHERE id = $1 AND owner = $2",
            UUID(dashboardId), owner
        )
        if not dash_row:
            raise ValueError("Dashboard not found")
        
        result = await conn.execute(
            "DELETE FROM dashboard_panels WHERE id = $1 AND dashboard_id = $2",
            UUID(panelId), UUID(dashboardId)
        )
        return result != "DELETE 0"
