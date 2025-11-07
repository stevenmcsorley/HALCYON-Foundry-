from __future__ import annotations

from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from .config import settings
from .repo_bindings import (
    list_bindings,
    create_binding,
    update_binding,
    delete_binding,
    get_binding,
)
from .autorun import preview_bindings, run_binding, get_audit_for_alert

router = APIRouter(prefix="/bindings", tags=["playbook-bindings"])
bindings_alerts_router = APIRouter(prefix="/alerts", tags=["playbook-bindings"])


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


class BindingInput(BaseModel):
    ruleId: Optional[int] = None
    playbookId: str
    mode: str
    matchTypes: Optional[List[str]] = None
    matchSeverities: Optional[List[str]] = None
    matchTags: Optional[List[str]] = None
    maxPerMinute: Optional[int] = 30
    maxConcurrent: Optional[int] = 5
    dailyQuota: Optional[int] = 500
    enabled: Optional[bool] = True


class RunBindingRequest(BaseModel):
    bindingId: int


def _binding_to_api(binding: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": binding.get("id"),
        "tenantId": binding.get("tenant_id"),
        "ruleId": binding.get("rule_id"),
        "playbookId": binding.get("playbook_id"),
        "mode": binding.get("mode"),
        "matchTypes": binding.get("match_types") or [],
        "matchSeverities": binding.get("match_severities") or [],
        "matchTags": binding.get("match_tags") or [],
        "maxPerMinute": binding.get("max_per_minute"),
        "maxConcurrent": binding.get("max_concurrent"),
        "dailyQuota": binding.get("daily_quota"),
        "enabled": binding.get("enabled"),
        "createdBy": binding.get("created_by"),
        "createdAt": binding.get("created_at"),
        "updatedAt": binding.get("updated_at"),
    }


@router.get("", response_model=List[Dict[str, Any]])
async def get_bindings(
    ruleId: Optional[int] = None,
    enabled: Optional[bool] = None,
    mode: Optional[str] = None,
):
    bindings = await list_bindings(rule_id=ruleId, enabled=enabled, mode=mode)
    return [_binding_to_api(b) for b in bindings]


@router.post("", response_model=Dict[str, Any], status_code=201)
async def post_binding(
    payload: BindingInput,
    user=Depends(require_roles(["analyst", "admin"])),
):
    data = payload.model_dump()
    data["created_by"] = user.get("sub")
    binding = await create_binding(
        {
            "tenant_id": None,
            "rule_id": data.get("ruleId"),
            "playbook_id": data["playbookId"],
            "mode": data["mode"],
            "match_types": data.get("matchTypes"),
            "match_severities": data.get("matchSeverities"),
            "match_tags": data.get("matchTags"),
            "max_per_minute": data.get("maxPerMinute", 30),
            "max_concurrent": data.get("maxConcurrent", 5),
            "daily_quota": data.get("dailyQuota", 500),
            "enabled": data.get("enabled", True),
        },
        created_by=user.get("sub", "system"),
    )
    return _binding_to_api(binding)


@router.put("/{binding_id:int}", response_model=Dict[str, Any])
async def put_binding(
    binding_id: int,
    payload: BindingInput,
    user=Depends(require_roles(["analyst", "admin"])),
):
    data = payload.model_dump()
    updated = await update_binding(
        binding_id,
        {
            "tenant_id": None,
            "rule_id": data.get("ruleId"),
            "playbook_id": data["playbookId"],
            "mode": data["mode"],
            "match_types": data.get("matchTypes"),
            "match_severities": data.get("matchSeverities"),
            "match_tags": data.get("matchTags"),
            "max_per_minute": data.get("maxPerMinute", 30),
            "max_concurrent": data.get("maxConcurrent", 5),
            "daily_quota": data.get("dailyQuota", 500),
            "enabled": data.get("enabled", True),
        },
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Binding not found")
    return _binding_to_api(updated)


@router.delete("/{binding_id:int}", response_model=Dict[str, Any])
async def delete_binding_endpoint(
    binding_id: int,
    user=Depends(require_roles(["analyst", "admin"])),
):
    existing = await get_binding(binding_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Binding not found")
    await delete_binding(binding_id)
    return {"ok": True}


@bindings_alerts_router.post("/{alert_id:int}/bindings/evaluate", response_model=List[Dict[str, Any]])
async def evaluate_alert_bindings(alert_id: int):
    preview = await preview_bindings(alert_id)
    return preview


@bindings_alerts_router.post("/{alert_id:int}/bindings/run", response_model=Dict[str, Any])
async def run_alert_binding(
    alert_id: int,
    payload: RunBindingRequest,
    user=Depends(require_roles(["analyst", "admin"])),
):
    audit = await run_binding(alert_id, payload.bindingId, user.get("sub", "system"))
    if not audit:
        raise HTTPException(status_code=404, detail="Binding or alert not found")
    return audit


@bindings_alerts_router.get("/{alert_id:int}/bindings/audit", response_model=List[Dict[str, Any]])
async def get_alert_binding_audit(alert_id: int):
    audits = await get_audit_for_alert(alert_id)
    return audits
