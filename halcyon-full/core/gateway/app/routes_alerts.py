from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Optional, List
from datetime import datetime
from .db import get_pool
from .models import AlertRuleIn, AlertRule, Alert
from .repo_alerts import create_rule, update_rule, delete_rule, list_rules, list_alerts, ack_alert, resolve_alert
from .config import settings

router = APIRouter(prefix="/alerts", tags=["alerts"])


def get_user(request: Request) -> dict:
    """Extract user info from request state."""
    user = getattr(request.state, "user", None)
    if not user:
        return {"sub": "anonymous", "roles": settings.default_roles}
    if isinstance(user, dict):
        return user
    return {"sub": getattr(user, "sub", "anonymous"), "roles": getattr(user, "roles", settings.default_roles)}


def require_roles(allowed_roles: List[str]):
    """Dependency to check if user has required role."""
    async def _check(request: Request):
        user = get_user(request)
        roles = user.get("roles", [])
        if not any(r in allowed_roles for r in roles):
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return _check


@router.get("/rules", response_model=List[AlertRule])
async def get_rules():
    """List all alert rules."""
    rules = await list_rules()
    # Ensure route field is included and created_at is string
    result = []
    for r in rules:
        # Convert created_at to string if it's a datetime
        if isinstance(r.get("created_at"), (datetime, str)):
            r["created_at"] = r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else str(r["created_at"])
        result.append(AlertRule(**r))
    return result


@router.post("/rules", response_model=dict, status_code=201)
async def post_rule(payload: AlertRuleIn, user=Depends(require_roles(["admin"]))):
    """Create a new alert rule (admin only)."""
    rule_dict = payload.model_dump()
    rule_dict["created_by"] = user.get("sub")
    rid = await create_rule(rule_dict)
    return {"id": rid}


@router.patch("/rules/{rule_id}", response_model=dict)
async def patch_rule(rule_id: int, payload: AlertRuleIn, user=Depends(require_roles(["admin"]))):
    """Update an alert rule (admin only)."""
    await update_rule(rule_id, payload.model_dump())
    return {"ok": True}


@router.delete("/rules/{rule_id}", response_model=dict)
async def del_rule(rule_id: int, user=Depends(require_roles(["admin"]))):
    """Delete an alert rule (admin only)."""
    await delete_rule(rule_id)
    return {"ok": True}


@router.get("/{alert_id:int}", response_model=Alert)
async def get_alert_by_id(alert_id: int):
    """Get a single alert by ID (public endpoint, no auth required)."""
    from .repo_alerts import get_alert as get_alert_repo
    alert = await get_alert_repo(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return Alert(**alert)


@router.get("", response_model=List[Alert])
async def get_alerts(status: Optional[str] = None, severity: Optional[str] = None):
    """List alerts with optional filters."""
    alerts = await list_alerts(status, severity)
    return [Alert(**a) for a in alerts]


@router.post("/{alert_id}/ack", response_model=dict)
async def post_ack(alert_id: int, user=Depends(require_roles(["analyst", "admin"]))):
    """Acknowledge an alert (analyst/admin only)."""
    await ack_alert(alert_id, user.get("sub"))
    # Publish alert.updated via WebSocket
    from .ws_pubsub import hub
    await hub.publish({"t": "alert.updated", "data": {"id": alert_id, "status": "ack"}})
    return {"ok": True}


@router.post("/{alert_id}/resolve", response_model=dict)
async def post_resolve(alert_id: int, user=Depends(require_roles(["admin"]))):
    """Resolve an alert (admin only)."""
    await resolve_alert(alert_id, user.get("sub"))
    # Publish alert.updated via WebSocket
    from .ws_pubsub import hub
    await hub.publish({"t": "alert.updated", "data": {"id": alert_id, "status": "resolved"}})
    return {"ok": True}
