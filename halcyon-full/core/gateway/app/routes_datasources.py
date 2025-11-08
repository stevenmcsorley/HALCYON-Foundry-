from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from .config import settings
from .repo_datasources import (
    list_datasources,
    get_datasource,
    create_datasource,
    update_datasource,
    archive_datasource,
    create_version,
    list_versions,
    get_version,
    publish_version,
    rollback_version,
    list_events,
    record_event,
    get_secrets,
    upsert_secret,
    delete_secret,
)
from .secret_store import secret_store


router = APIRouter(prefix="/datasources", tags=["datasources"])


def get_user(request: Request) -> Dict[str, Any]:
    user = getattr(request.state, "user", None)
    if not user:
        return {"sub": "anonymous", "roles": settings.default_roles}
    if isinstance(user, dict):
        return user
    return {
        "sub": getattr(user, "sub", "anonymous"),
        "roles": getattr(user, "roles", settings.default_roles),
    }


def require_roles(allowed_roles: List[str]):
    async def _check(request: Request):
        user = get_user(request)
        roles = user.get("roles", [])
        if not any(r in allowed_roles for r in roles):
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user

    return _check


class DatasourceCreateRequest(BaseModel):
    name: str
    type: str
    description: Optional[str] = None
    ownerId: Optional[str] = Field(default=None, alias="ownerId")
    orgId: Optional[UUID] = Field(default=None, alias="orgId")
    projectId: Optional[UUID] = Field(default=None, alias="projectId")
    tags: Optional[List[str]] = None
    status: Optional[str] = None


class DatasourceUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    ownerId: Optional[str] = Field(default=None, alias="ownerId")
    orgId: Optional[UUID] = Field(default=None, alias="orgId")
    projectId: Optional[UUID] = Field(default=None, alias="projectId")
    tags: Optional[List[str]] = None
    status: Optional[str] = None


class DatasourceVersionRequest(BaseModel):
    config: Dict[str, Any]
    summary: Optional[str] = None


class PublishRequest(BaseModel):
    version: int
    comment: Optional[str] = None


class RollbackRequest(BaseModel):
    targetVersion: int
    comment: Optional[str] = None


class DatasourceTestRequest(BaseModel):
    payload: Dict[str, Any] = Field(default_factory=dict)
    version: Optional[int] = None
    configOverride: Optional[Dict[str, Any]] = None


class DatasourceSecretRequest(BaseModel):
    key: str
    value: str


class DatasourceSecretResponse(BaseModel):
    key: str
    version: int
    createdAt: str
    createdBy: Optional[str] = None
    rotatedAt: Optional[str] = None
    rotatedBy: Optional[str] = None

def _to_api(datasource: Dict[str, Any]) -> Dict[str, Any]:
    if not datasource:
        return datasource
    result = datasource.copy()
    result.setdefault("tags", [])
    return result


def _to_version_api(version: Dict[str, Any]) -> Dict[str, Any]:
    result = version.copy()
    result["config"] = result.pop("config_json", {})
    return result


@router.get("", response_model=List[Dict[str, Any]])
async def list_datasource_endpoint(
    status: Optional[str] = None,
    type: Optional[str] = None,
    ownerId: Optional[str] = None,
    orgId: Optional[UUID] = None,
    projectId: Optional[UUID] = None,
    search: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    user=Depends(require_roles(["viewer", "analyst", "admin"])),
):
    types = [type] if type else None
    datasources = await list_datasources(
        status=status,
        types=types,
        owner_id=ownerId,
        org_id=orgId,
        project_id=projectId,
        search=search,
        limit=limit,
        offset=offset,
    )
    return [_to_api(d) for d in datasources]


@router.post("", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
async def create_datasource_endpoint(
    payload: DatasourceCreateRequest,
    user=Depends(require_roles(["admin", "analyst"])),
):
    data = payload.model_dump()
    status_value = data.get("status") or "draft"
    created = await create_datasource(
        {
            "name": data["name"],
            "description": data.get("description"),
            "type": data["type"],
            "owner_id": data.get("ownerId"),
            "org_id": data.get("orgId"),
            "project_id": data.get("projectId"),
            "tags": data.get("tags") or [],
            "status": status_value,
            "created_by": user.get("sub"),
        }
    )
    await record_event(created["id"], "create", user.get("sub"), payload={"status": status_value})
    return _to_api(created)


@router.get("/{datasource_id}", response_model=Dict[str, Any])
async def get_datasource_endpoint(
    datasource_id: UUID,
    user=Depends(require_roles(["viewer", "analyst", "admin"])),
):
    datasource = await get_datasource(datasource_id)
    if not datasource:
        raise HTTPException(status_code=404, detail="Datasource not found")
    return _to_api(datasource)


@router.put("/{datasource_id}", response_model=Dict[str, Any])
async def update_datasource_endpoint(
    datasource_id: UUID,
    payload: DatasourceUpdateRequest,
    user=Depends(require_roles(["admin", "analyst"])),
):
    data = payload.model_dump()
    data["updated_by"] = user.get("sub")
    updated = await update_datasource(datasource_id, data)
    if not updated:
        raise HTTPException(status_code=404, detail="Datasource not found")
    await record_event(datasource_id, "update", user.get("sub"), payload=data)
    return _to_api(updated)


@router.delete("/{datasource_id}", response_model=Dict[str, Any])
async def delete_datasource_endpoint(
    datasource_id: UUID,
    user=Depends(require_roles(["admin"])),
):
    success = await archive_datasource(datasource_id, user.get("sub"))
    if not success:
        raise HTTPException(status_code=404, detail="Datasource not found or already archived")
    await record_event(datasource_id, "archive", user.get("sub"), payload={"status": "disabled"})
    return {"ok": True}


@router.post("/{datasource_id}/versions", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
async def create_version_endpoint(
    datasource_id: UUID,
    payload: DatasourceVersionRequest,
    user=Depends(require_roles(["admin", "analyst"])),
):
    version = await create_version(
        datasource_id,
        payload.config,
        payload.summary,
        user.get("sub"),
    )
    return _to_version_api(version)


@router.get("/{datasource_id}/versions", response_model=List[Dict[str, Any]])
async def list_versions_endpoint(
    datasource_id: UUID,
    limit: int = 50,
    offset: int = 0,
    user=Depends(require_roles(["viewer", "analyst", "admin"])),
):
    versions = await list_versions(datasource_id, limit=limit, offset=offset)
    return [_to_version_api(v) for v in versions]


@router.get("/{datasource_id}/versions/{version}", response_model=Dict[str, Any])
async def get_version_endpoint(
    datasource_id: UUID,
    version: int,
    user=Depends(require_roles(["viewer", "analyst", "admin"])),
):
    v = await get_version(datasource_id, version)
    if not v:
        raise HTTPException(status_code=404, detail="Version not found")
    return _to_version_api(v)


@router.post("/{datasource_id}/publish", response_model=Dict[str, Any])
async def publish_version_endpoint(
    datasource_id: UUID,
    payload: PublishRequest,
    user=Depends(require_roles(["admin"])),
):
    published = await publish_version(
        datasource_id,
        payload.version,
        user.get("sub"),
        comment=payload.comment,
    )
    return _to_version_api(published)


@router.post("/{datasource_id}/rollback", response_model=Dict[str, Any])
async def rollback_version_endpoint(
    datasource_id: UUID,
    payload: RollbackRequest,
    user=Depends(require_roles(["admin"])),
):
    version = await rollback_version(
        datasource_id,
        payload.targetVersion,
        user.get("sub"),
        comment=payload.comment,
    )
    return _to_version_api(version)


@router.get("/{datasource_id}/events", response_model=List[Dict[str, Any]])
async def list_events_endpoint(
    datasource_id: UUID,
    limit: int = 50,
    offset: int = 0,
    eventType: Optional[str] = None,
    user=Depends(require_roles(["viewer", "analyst", "admin"])),
):
    event_types = [eventType] if eventType else None
    events = await list_events(datasource_id, limit=limit, offset=offset, event_types=event_types)
    return events


async def _call_registry(method: str, path: str, payload: Optional[Dict[str, Any]] = None) -> Any:
    import httpx

    async with httpx.AsyncClient(base_url=settings.registry_base_url, timeout=20) as client:
        response = await client.request(method, path, json=payload)

    if response.status_code >= 400:
        try:
            detail = response.json().get("detail")
        except ValueError:
            detail = response.text
        raise HTTPException(status_code=response.status_code, detail=detail or "Registry error")

    if not response.content:
        return {"ok": True}
    try:
        return response.json()
    except ValueError:
        return {"ok": True}


@router.post("/{datasource_id}/test", response_model=Dict[str, Any])
async def test_datasource_endpoint(
    datasource_id: UUID,
    payload: DatasourceTestRequest,
    user=Depends(require_roles(["admin", "analyst"])),
):
    return await _call_registry(
        "POST",
        f"/internal/datasources/{datasource_id}/test",
        {
            "payload": payload.payload,
            "version": payload.version,
            "configOverride": payload.configOverride,
        },
    )


@router.post("/{datasource_id}/start", response_model=Dict[str, Any])
async def start_datasource_endpoint(
    datasource_id: UUID,
    user=Depends(require_roles(["admin", "analyst"])),
):
    result = await _call_registry("POST", f"/internal/datasources/{datasource_id}/start")
    try:
        await update_datasource(
            datasource_id,
            {
                "status": "active",
                "updated_by": user.get("sub"),
            },
        )
        await record_event(
            datasource_id,
            "lifecycle_start",
            user.get("sub"),
            payload={"status": "active"},
        )
    except Exception as exc:
        logger = logging.getLogger(__name__)
        logger.warning("Failed to persist datasource %s start status: %s", datasource_id, exc)
    return result


@router.post("/{datasource_id}/stop", response_model=Dict[str, Any])
async def stop_datasource_endpoint(
    datasource_id: UUID,
    user=Depends(require_roles(["admin", "analyst"])),
):
    result = await _call_registry("POST", f"/internal/datasources/{datasource_id}/stop")
    try:
        await update_datasource(
            datasource_id,
            {
                "status": "paused",
                "updated_by": user.get("sub"),
            },
        )
        await record_event(
            datasource_id,
            "lifecycle_stop",
            user.get("sub"),
            payload={"status": "paused"},
        )
    except Exception as exc:
        logger = logging.getLogger(__name__)
        logger.warning("Failed to persist datasource %s stop status: %s", datasource_id, exc)
    return {**result, "status": "paused"}


@router.post("/{datasource_id}/restart", response_model=Dict[str, Any])
async def restart_datasource_endpoint(
    datasource_id: UUID,
    user=Depends(require_roles(["admin", "analyst"])),
):
    return await _call_registry("POST", f"/internal/datasources/{datasource_id}/restart")


@router.post("/{datasource_id}/backfill", response_model=Dict[str, Any])
async def backfill_datasource_endpoint(
    datasource_id: UUID,
    user=Depends(require_roles(["admin", "analyst"])),
):
    return await _call_registry("POST", f"/internal/datasources/{datasource_id}/backfill")


@router.get("/{datasource_id}/secrets", response_model=List[DatasourceSecretResponse])
async def list_secrets_endpoint(
    datasource_id: UUID,
    user=Depends(require_roles(["admin", "analyst"])),
):
    secrets = await get_secrets(datasource_id)
    return [
        DatasourceSecretResponse(
            key=row["key"],
            version=row["version"],
            createdAt=row["created_at"].isoformat(),
            createdBy=row.get("created_by"),
            rotatedAt=row.get("rotated_at").isoformat() if row.get("rotated_at") else None,
            rotatedBy=row.get("rotated_by"),
        )
        for row in secrets
    ]


@router.post("/{datasource_id}/secrets", response_model=DatasourceSecretResponse, status_code=status.HTTP_201_CREATED)
async def upsert_secret_endpoint(
    datasource_id: UUID,
    payload: DatasourceSecretRequest,
    user=Depends(require_roles(["admin"])),
):
    encrypted = secret_store.encrypt(payload.value)
    record = await upsert_secret(datasource_id, payload.key, encrypted, user.get("sub"))
    await record_event(
        datasource_id,
        "secret_upsert",
        user.get("sub"),
        payload={"key": payload.key, "version": record.get("version")},
    )
    return DatasourceSecretResponse(
        key=record["key"],
        version=record["version"],
        createdAt=record["created_at"].isoformat(),
        createdBy=record.get("created_by"),
        rotatedAt=record.get("rotated_at").isoformat() if record.get("rotated_at") else None,
        rotatedBy=record.get("rotated_by"),
    )


@router.delete("/{datasource_id}/secrets/{secret_key}", response_model=Dict[str, bool])
async def delete_secret_endpoint(
    datasource_id: UUID,
    secret_key: str,
    user=Depends(require_roles(["admin"])),
):
    existed = await delete_secret(datasource_id, secret_key)
    if not existed:
        raise HTTPException(status_code=404, detail="Secret not found")
    await record_event(
        datasource_id,
        "secret_delete",
        user.get("sub"),
        payload={"key": secret_key},
    )
    return {"ok": True}

