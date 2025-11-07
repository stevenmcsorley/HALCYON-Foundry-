from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence
from uuid import UUID

from ariadne import QueryType, MutationType
from graphql import GraphQLError
import httpx

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


datasource_query = QueryType()
datasource_mutation = MutationType()


def _get_user(info) -> Dict[str, Any]:
    return info.context.get("user", {"sub": "anonymous", "roles": settings.default_roles})


def _require_roles(info, allowed: Sequence[str]) -> Dict[str, Any]:
    user = _get_user(info)
    roles = set(user.get("roles", settings.default_roles))
    if not roles.intersection(allowed):
        raise GraphQLError("Insufficient permissions")
    return user


def _to_iso(dt: Any) -> Optional[str]:
    if not dt:
        return None
    if hasattr(dt, "isoformat"):
        return dt.isoformat()
    return str(dt)


def _to_graphql_state(state: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not state:
        return None
    return {
        "workerStatus": state.get("worker_status") or state.get("workerStatus"),
        "lastHeartbeatAt": _to_iso(state.get("last_heartbeat_at") or state.get("lastHeartbeatAt")),
        "lastEventAt": _to_iso(state.get("last_event_at") or state.get("lastEventAt")),
        "errorCode": state.get("error_code") or state.get("errorCode"),
        "errorMessage": state.get("error_message") or state.get("errorMessage"),
        "metrics": state.get("metrics_snapshot") or state.get("metrics") or {},
        "updatedAt": _to_iso(state.get("updated_at") or state.get("updatedAt")),
    }


def _to_graphql_datasource(data: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(data.get("id")),
        "name": data.get("name"),
        "description": data.get("description"),
        "type": data.get("type"),
        "ownerId": data.get("owner_id"),
        "orgId": str(data.get("org_id")) if data.get("org_id") else None,
        "projectId": str(data.get("project_id")) if data.get("project_id") else None,
        "tags": list(data.get("tags") or []),
        "status": data.get("status"),
        "createdAt": _to_iso(data.get("created_at")),
        "createdBy": data.get("created_by"),
        "updatedAt": _to_iso(data.get("updated_at")),
        "updatedBy": data.get("updated_by"),
        "archivedAt": _to_iso(data.get("archived_at")),
        "currentVersion": data.get("current_version"),
        "state": _to_graphql_state(data.get("state")),
    }


def _to_graphql_version(version: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "version": version.get("version"),
        "state": version.get("state"),
        "config": version.get("config_json") or version.get("config"),
        "summary": version.get("summary"),
        "createdAt": _to_iso(version.get("created_at")),
        "createdBy": version.get("created_by"),
        "approvedAt": _to_iso(version.get("approved_at")),
        "approvedBy": version.get("approved_by"),
    }


def _to_graphql_event(event: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(event.get("id")),
        "version": event.get("version"),
        "eventType": event.get("event_type"),
        "actor": event.get("actor"),
        "payload": event.get("payload"),
        "createdAt": _to_iso(event.get("created_at")),
    }


def _to_graphql_secret(secret: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "key": secret.get("key"),
        "version": secret.get("version"),
        "createdAt": _to_iso(secret.get("created_at")),
        "createdBy": secret.get("created_by"),
        "rotatedAt": _to_iso(secret.get("rotated_at")),
        "rotatedBy": secret.get("rotated_by"),
    }


async def _registry_request(method: str, path: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    async with httpx.AsyncClient(base_url=settings.registry_base_url, timeout=20) as client:
        response = await client.request(method, path, json=payload)
    if response.status_code >= 400:
        try:
            detail = response.json().get("detail")
        except ValueError:
            detail = response.text
        raise GraphQLError(detail or "Registry error")
    if not response.content:
        return {}
    try:
        return response.json()
    except ValueError:
        return {}


@datasource_query.field("datasources")
async def resolve_datasources(
    _,
    info,
    status: Optional[str] = None,
    type: Optional[str] = None,
    ownerId: Optional[str] = None,
    orgId: Optional[str] = None,
    projectId: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
):
    _require_roles(info, ["viewer", "analyst", "admin"])
    types = [type] if type else None
    org_uuid = UUID(orgId) if orgId else None
    proj_uuid = UUID(projectId) if projectId else None
    datasources = await list_datasources(
        status=status,
        types=types,
        owner_id=ownerId,
        org_id=org_uuid,
        project_id=proj_uuid,
        search=search,
        limit=limit,
        offset=offset,
    )
    return [_to_graphql_datasource(d) for d in datasources]


@datasource_query.field("datasource")
async def resolve_datasource(_, info, id: str):
    _require_roles(info, ["viewer", "analyst", "admin"])
    datasource = await get_datasource(UUID(id))
    if not datasource:
        return None
    return _to_graphql_datasource(datasource)


@datasource_query.field("datasourceVersions")
async def resolve_datasource_versions(
    _,
    info,
    id: str,
    limit: int = 50,
    offset: int = 0,
):
    _require_roles(info, ["viewer", "analyst", "admin"])
    versions = await list_versions(UUID(id), limit=limit, offset=offset)
    return [_to_graphql_version(v) for v in versions]


@datasource_query.field("datasourceEvents")
async def resolve_datasource_events(
    _,
    info,
    id: str,
    limit: int = 50,
    offset: int = 0,
    eventType: Optional[str] = None,
):
    _require_roles(info, ["viewer", "analyst", "admin"])
    event_types = [eventType] if eventType else None
    events = await list_events(UUID(id), limit=limit, offset=offset, event_types=event_types)
    return [_to_graphql_event(e) for e in events]


@datasource_query.field("datasourceSecrets")
async def resolve_datasource_secrets(_, info, id: str):
    _require_roles(info, ["admin", "analyst"])
    secrets = await get_secrets(UUID(id))
    return [_to_graphql_secret(s) for s in secrets]


@datasource_query.field("datasourceState")
async def resolve_datasource_state(_, info, id: str):
    _require_roles(info, ["viewer", "analyst", "admin"])
    state = await _registry_request("GET", f"/internal/datasources/{id}/state")
    datasource = await get_datasource(UUID(id))
    return {
        "datasource": _to_graphql_datasource(datasource) if datasource else None,
        "running": bool(state.get("running")),
    }


@datasource_mutation.field("createDatasource")
async def resolve_create_datasource(_, info, input):
    user = _require_roles(info, ["admin", "analyst"])
    payload = {
        "name": input["name"],
        "description": input.get("description"),
        "type": input["type"],
        "owner_id": input.get("ownerId"),
        "org_id": UUID(input["orgId"]) if input.get("orgId") else None,
        "project_id": UUID(input["projectId"]) if input.get("projectId") else None,
        "tags": input.get("tags") or [],
        "status": input.get("status", "draft"),
        "created_by": user.get("sub"),
    }
    datasource = await create_datasource(payload)
    await record_event(datasource["id"], "create", user.get("sub"), payload={"status": datasource.get("status")})

    # Auto-start if immediately active with published config
    if datasource.get("status") == "active" and datasource.get("current_version"):
        try:
            await _registry_request("POST", f"/internal/datasources/{datasource['id']}/start")
        except GraphQLError:
            # ignore start failure here; surfaced via state later
            pass

    return _to_graphql_datasource(datasource)


@datasource_mutation.field("updateDatasource")
async def resolve_update_datasource(_, info, id: str, input):
    user = _require_roles(info, ["admin", "analyst"])
    payload = {}
    if "name" in input:
        payload["name"] = input["name"]
    if "description" in input:
        payload["description"] = input["description"]
    if "ownerId" in input:
        payload["owner_id"] = input["ownerId"]
    if "orgId" in input and input["orgId"] is not None:
        payload["org_id"] = UUID(input["orgId"]) if input["orgId"] else None
    if "projectId" in input and input["projectId"] is not None:
        payload["project_id"] = UUID(input["projectId"]) if input["projectId"] else None
    if "tags" in input:
        payload["tags"] = input.get("tags") or []
    if "status" in input:
        payload["status"] = input["status"]
    payload["updated_by"] = user.get("sub")

    updated = await update_datasource(UUID(id), payload)
    if not updated:
        raise GraphQLError("Datasource not found")
    await record_event(UUID(id), "update", user.get("sub"), payload=input)

    if "status" in input:
        desired = input["status"]
        try:
            if desired == "active":
                await _registry_request("POST", f"/internal/datasources/{id}/start")
            elif desired in {"disabled", "draft"}:
                await _registry_request("POST", f"/internal/datasources/{id}/stop")
        except GraphQLError:
            pass

    return _to_graphql_datasource(updated)


@datasource_mutation.field("archiveDatasource")
async def resolve_archive_datasource(_, info, id: str):
    user = _require_roles(info, ["admin"])
    success = await archive_datasource(UUID(id), user.get("sub"))
    if not success:
        raise GraphQLError("Datasource not found or already archived")
    await record_event(UUID(id), "archive", user.get("sub"), payload={"status": "disabled"})
    try:
        await _registry_request("POST", f"/internal/datasources/{id}/stop")
    except GraphQLError:
        pass
    return True


@datasource_mutation.field("createDatasourceVersion")
async def resolve_create_datasource_version(_, info, id: str, input):
    user = _require_roles(info, ["admin", "analyst"])
    version = await create_version(
        UUID(id),
        input.get("config") or {},
        input.get("summary"),
        user.get("sub"),
    )
    return _to_graphql_version(version)


@datasource_mutation.field("publishDatasourceVersion")
async def resolve_publish_datasource_version(_, info, id: str, version: int, comment: Optional[str] = None):
    user = _require_roles(info, ["admin"])
    published = await publish_version(UUID(id), version, user.get("sub"), comment=comment)
    try:
        await _registry_request("POST", f"/internal/datasources/{id}/reload")
    except GraphQLError:
        pass
    return _to_graphql_version(published)


@datasource_mutation.field("rollbackDatasource")
async def resolve_rollback_datasource(_, info, id: str, targetVersion: int, comment: Optional[str] = None):
    user = _require_roles(info, ["admin"])
    rolled = await rollback_version(UUID(id), targetVersion, user.get("sub"), comment=comment)
    try:
        await _registry_request("POST", f"/internal/datasources/{id}/reload")
    except GraphQLError:
        pass
    return _to_graphql_version(rolled)


@datasource_mutation.field("startDatasource")
async def resolve_start_datasource(_, info, id: str):
    _require_roles(info, ["admin", "analyst"])
    state = await _registry_request("POST", f"/internal/datasources/{id}/start")
    datasource = await get_datasource(UUID(id))
    return {
        "datasource": _to_graphql_datasource(datasource) if datasource else None,
        "running": True,
    }


@datasource_mutation.field("stopDatasource")
async def resolve_stop_datasource(_, info, id: str):
    _require_roles(info, ["admin", "analyst"])
    await _registry_request("POST", f"/internal/datasources/{id}/stop")
    datasource = await get_datasource(UUID(id))
    return {
        "datasource": _to_graphql_datasource(datasource) if datasource else None,
        "running": False,
    }


@datasource_mutation.field("restartDatasource")
async def resolve_restart_datasource(_, info, id: str):
    _require_roles(info, ["admin", "analyst"])
    await _registry_request("POST", f"/internal/datasources/{id}/restart")
    datasource = await get_datasource(UUID(id))
    return {
        "datasource": _to_graphql_datasource(datasource) if datasource else None,
        "running": True,
    }


@datasource_mutation.field("testDatasource")
async def resolve_test_datasource(_, info, id: str, payload: Dict[str, Any], version: Optional[int] = None, configOverride: Optional[Dict[str, Any]] = None):
    _require_roles(info, ["admin", "analyst"])
    result = await _registry_request(
        "POST",
        f"/internal/datasources/{id}/test",
        {
            "payload": payload,
            "version": version,
            "configOverride": configOverride,
        },
    )
    return {
        "success": bool(result.get("success")),
        "output": result.get("output"),
        "warnings": result.get("warnings") or [],
        "logs": result.get("logs") or [],
    }


@datasource_mutation.field("backfillDatasource")
async def resolve_backfill_datasource(_, info, id: str):
    _require_roles(info, ["admin", "analyst"])
    await _registry_request("POST", f"/internal/datasources/{id}/backfill")
    return True


@datasource_mutation.field("upsertDatasourceSecret")
async def resolve_upsert_datasource_secret(_, info, id: str, key: str, value: str):
    user = _require_roles(info, ["admin"])
    encrypted = secret_store.encrypt(value)
    record = await upsert_secret(UUID(id), key, encrypted, user.get("sub"))
    await record_event(UUID(id), "secret_upsert", user.get("sub"), payload={"key": key, "version": record.get("version")})
    return _to_graphql_secret(record)


@datasource_mutation.field("deleteDatasourceSecret")
async def resolve_delete_datasource_secret(_, info, id: str, key: str):
    user = _require_roles(info, ["admin"])
    deleted = await delete_secret(UUID(id), key)
    if not deleted:
        raise GraphQLError("Secret not found")
    await record_event(UUID(id), "secret_delete", user.get("sub"), payload={"key": key})
    return True

