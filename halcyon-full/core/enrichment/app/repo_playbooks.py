"""Repository layer for Playbook Studio CRUD operations and versioning."""
import asyncpg
import json
from typing import List, Dict, Any, Optional
from datetime import datetime
from .db import get_pool


async def create_playbook(
    playbook_id: str,
    name: str,
    description: Optional[str],
    json_body: Dict[str, Any],
    status: str = "draft",
    created_by: Optional[str] = None
) -> Dict[str, Any]:
    """Create a new playbook."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Extract steps from json_body for backward compatibility
        steps_json = json_body.get("steps", [])
        
        # Insert into playbooks table
        await conn.execute(
            """
            INSERT INTO playbooks (id, name, description, steps_json, status, created_by, version)
            VALUES ($1, $2, $3, $4::jsonb, $5, $6, '1.0.0')
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                steps_json = EXCLUDED.steps_json,
                status = EXCLUDED.status,
                updated_at = now()
            """,
            playbook_id, name, description, json.dumps(steps_json), status, created_by
        )
        
        # Create initial version
        await conn.execute(
            """
            INSERT INTO playbook_versions (playbook_id, version, json_body, created_by)
            VALUES ($1, 1, $2::jsonb, $3)
            ON CONFLICT (playbook_id, version) DO NOTHING
            """,
            playbook_id, json.dumps(json_body), created_by
        )
    
    return await get_playbook(playbook_id)


async def get_playbook(playbook_id: str) -> Optional[Dict[str, Any]]:
    """Get a single playbook by ID."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM playbooks WHERE id = $1", playbook_id)
        if not row:
            return None
        
        # Get latest version JSON
        version_row = await conn.fetchrow(
            "SELECT json_body FROM playbook_versions WHERE playbook_id = $1 ORDER BY version DESC LIMIT 1",
            playbook_id
        )
        
        json_body = json.loads(version_row["json_body"]) if version_row else {
            "steps": json.loads(row["steps_json"]) if isinstance(row["steps_json"], str) else row["steps_json"]
        }
        
        return {
            "id": row["id"],
            "name": row["name"],
            "description": row["description"],
            "status": row["status"] or "draft",
            "version": row["version"],
            "steps": json_body.get("steps", []),
            "jsonBody": json_body,
            "createdBy": row["created_by"],
            "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
            "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
            "enabled": row["enabled"]
        }


async def list_playbooks(
    status: Optional[str] = None,
    created_by: Optional[str] = None,
    include_drafts: bool = True
) -> List[Dict[str, Any]]:
    """List all playbooks with optional filters."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        query = "SELECT * FROM playbooks WHERE enabled = TRUE"
        params = []
        
        if not include_drafts:
            query += " AND status = 'published'"
        elif status:
            query += " AND status = $1"
            params.append(status)
        
        if created_by:
            query += f" AND created_by = ${len(params) + 1}"
            params.append(created_by)
        
        query += " ORDER BY updated_at DESC"
        
        rows = await conn.fetch(query, *params)
        results = []
        
        for row in rows:
            # Get latest version JSON
            version_row = await conn.fetchrow(
                "SELECT json_body FROM playbook_versions WHERE playbook_id = $1 ORDER BY version DESC LIMIT 1",
                row["id"]
            )
            
            json_body = json.loads(version_row["json_body"]) if version_row else {
                "steps": json.loads(row["steps_json"]) if isinstance(row["steps_json"], str) else row["steps_json"]
            }
            
            results.append({
                "id": row["id"],
                "name": row["name"],
                "description": row["description"],
                "status": row["status"] or "draft",
                "version": row["version"],
                "steps": json_body.get("steps", []),
                "createdBy": row["created_by"],
                "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
                "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None
            })
        
        return results


async def update_playbook(
    playbook_id: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
    json_body: Optional[Dict[str, Any]] = None,
    status: Optional[str] = None,
    updated_by: Optional[str] = None,
    release_notes: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Update a playbook and create a new version."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Get current version
        current = await get_playbook(playbook_id)
        if not current:
            return None
        
        # Build update query
        updates = []
        params = []
        param_idx = 1
        
        if name is not None:
            updates.append(f"name = ${param_idx}")
            params.append(name)
            param_idx += 1
        
        if description is not None:
            updates.append(f"description = ${param_idx}")
            params.append(description)
            param_idx += 1
        
        if status is not None:
            updates.append(f"status = ${param_idx}")
            params.append(status)
            param_idx += 1
        
        if json_body is not None:
            # Extract steps for backward compatibility
            steps_json = json_body.get("steps", [])
            updates.append(f"steps_json = ${param_idx}::jsonb")
            params.append(json.dumps(steps_json))
            param_idx += 1
        
        if updates:
            params.append(playbook_id)
            await conn.execute(
                f"UPDATE playbooks SET {', '.join(updates)} WHERE id = ${param_idx}",
                *params
            )
        
        # Create new version if json_body changed or status changed to published (with or without release notes)
        should_create_version = False
        version_json_body = None
        
        if json_body is not None:
            # json_body changed, create version
            should_create_version = True
            version_json_body = json_body
        elif status == "published":
            # Publishing (even without json_body change), create version if release_notes provided or if this is first publish
            current_playbook = await get_playbook(playbook_id)
            if release_notes or (current_playbook and current_playbook.get("status") != "published"):
                should_create_version = True
                version_json_body = current.get("jsonBody", {}) if current else {}
        
        if should_create_version:
            # Get next version number
            version_row = await conn.fetchrow(
                "SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM playbook_versions WHERE playbook_id = $1",
                playbook_id
            )
            next_version = version_row["next_version"] if version_row else 1
            
            # Use provided json_body or get current
            if version_json_body is None:
                current_playbook = await get_playbook(playbook_id)
                version_json_body = current_playbook.get("jsonBody", {}) if current_playbook else {}
            
            await conn.execute(
                """
                INSERT INTO playbook_versions (playbook_id, version, json_body, created_by, release_notes)
                VALUES ($1, $2, $3::jsonb, $4, $5)
                """,
                playbook_id, next_version, json.dumps(version_json_body), updated_by, release_notes
            )
    
    return await get_playbook(playbook_id)


async def delete_playbook(playbook_id: str) -> bool:
    """Delete a playbook (soft delete by setting enabled = false)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE playbooks SET enabled = FALSE WHERE id = $1",
            playbook_id
        )
        return result == "UPDATE 1"


async def get_playbook_versions(playbook_id: str) -> List[Dict[str, Any]]:
    """Get all versions of a playbook."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM playbook_versions WHERE playbook_id = $1 ORDER BY version DESC",
            playbook_id
        )
        return [
            {
                "id": r["id"],
                "playbookId": r["playbook_id"],
                "version": r["version"],
                "releaseNotes": r.get("release_notes"),
                "jsonBody": json.loads(r["json_body"]) if isinstance(r["json_body"], str) else r["json_body"],
                "createdBy": r["created_by"],
                "createdAt": r["created_at"].isoformat() if r["created_at"] else None
            }
            for r in rows
        ]


async def get_playbook_version(playbook_id: str, version: int) -> Optional[Dict[str, Any]]:
    """Get a specific version of a playbook."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM playbook_versions WHERE playbook_id = $1 AND version = $2",
            playbook_id, version
        )
        if not row:
            return None
        
        return {
            "id": row["id"],
            "playbookId": row["playbook_id"],
            "version": row["version"],
            "jsonBody": json.loads(row["json_body"]) if isinstance(row["json_body"], str) else row["json_body"],
            "createdBy": row["created_by"],
            "createdAt": row["created_at"].isoformat() if row["created_at"] else None
        }


async def rollback_playbook(playbook_id: str, version: int, rolled_back_by: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Rollback a playbook to a specific version."""
    # Get the version to rollback to
    target_version = await get_playbook_version(playbook_id, version)
    if not target_version:
        return None
    
    # Update playbook with the version's JSON body
    return await update_playbook(
        playbook_id,
        json_body=target_version["jsonBody"],
        updated_by=rolled_back_by
    )

