"""REST API routes for alert action logs and delivery trace."""
from fastapi import APIRouter, Request, HTTPException, Depends
from typing import List, Optional
from pydantic import BaseModel
from .db import get_pool
from .repo_actions import list_action_logs, get_latest_per_dest, enqueue_manual_retry, get_failed_destinations
from .repo_alerts import get_alert, get_rule
from .routing_preview import preview_routes
from .metrics import alert_actions_preview_total, alert_manual_retry_total
from .config import settings
import json

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


class ActionAttempt(BaseModel):
    id: int
    alertId: int
    dest: str
    status: str
    httpStatus: Optional[int] = None
    error: Optional[str] = None
    attempt: int
    scheduledAt: Optional[str] = None
    sentAt: Optional[str] = None
    createdAt: str


class RouteDecision(BaseModel):
    dest: str
    wouldSend: bool
    reason: str
    suppressed: bool


class RetryRequest(BaseModel):
    dest: str


@router.get("/{alert_id}/actions/logs", response_model=List[ActionAttempt])
async def get_action_logs(alert_id: int, user=Depends(get_user)):
    """Get action log timeline for an alert (viewer+)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        logs = await list_action_logs(conn, alert_id)
        return [
            ActionAttempt(
                id=l["id"],
                alertId=l["alert_id"],
                dest=l["dest"],
                status=l["status"],
                httpStatus=l.get("http_status"),
                error=l.get("error"),
                attempt=l["attempt"],
                scheduledAt=l["scheduled_at"].isoformat() if l.get("scheduled_at") else None,
                sentAt=l["sent_at"].isoformat() if l.get("sent_at") else None,
                createdAt=l["created_at"].isoformat()
            )
            for l in logs
        ]


@router.post("/{alert_id}/actions/retry", response_model=ActionAttempt, status_code=201)
async def retry_action(
    alert_id: int,
    payload: RetryRequest,
    user=Depends(require_roles(["analyst", "admin"]))
):
    """Enqueue a manual retry for a specific destination (analyst/admin only)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Verify alert exists
        alert = await get_alert(alert_id)
        if not alert:
            raise HTTPException(status_code=404, detail="Alert not found")
        
        # Extract base dest (slack or webhook) from dest string (e.g., "slack:channel" -> "slack")
        dest_base = payload.dest.split(":")[0] if ":" in payload.dest else payload.dest
        
        # Validate dest
        if dest_base not in ["slack", "webhook"]:
            raise HTTPException(status_code=400, detail="Invalid destination. Must be 'slack' or 'webhook'")
        
        # Enqueue retry
        retry_log = await enqueue_manual_retry(
            conn, alert_id, dest_base, f"Manual retry by {user.get('sub')}", user.get("sub")
        )
        
        alert_manual_retry_total.labels(dest=dest_base).inc()
        
        return ActionAttempt(
            id=retry_log["id"],
            alertId=retry_log["alert_id"],
            dest=retry_log["dest"],
            status=retry_log["status"],
            httpStatus=retry_log.get("http_status"),
            error=retry_log.get("error"),
            attempt=retry_log["attempt"],
            scheduledAt=retry_log["scheduled_at"].isoformat() if retry_log.get("scheduled_at") else None,
            sentAt=retry_log["sent_at"].isoformat() if retry_log.get("sent_at") else None,
            createdAt=retry_log["created_at"].isoformat()
        )


@router.post("/{alert_id}/actions/retry-all-failed", response_model=List[ActionAttempt], status_code=201)
async def retry_all_failed(
    alert_id: int,
    user=Depends(require_roles(["analyst", "admin"]))
):
    """Retry all failed destinations for an alert (analyst/admin only)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Verify alert exists
        alert = await get_alert(alert_id)
        if not alert:
            raise HTTPException(status_code=404, detail="Alert not found")
        
        # Get failed destinations
        failed_dests = await get_failed_destinations(conn, alert_id)
        
        if not failed_dests:
            return []
        
        # Enqueue retries for each failed destination
        retries = []
        for dest in failed_dests:
            # Extract base dest (dest is already just "slack" or "webhook" from get_failed_destinations)
            retry_log = await enqueue_manual_retry(
                conn, alert_id, dest, f"Bulk retry by {user.get('sub')}", user.get("sub")
            )
            retries.append(retry_log)
            alert_manual_retry_total.labels(dest=dest).inc()
        
        return [
            ActionAttempt(
                id=r["id"],
                alertId=r["alert_id"],
                dest=r["dest"],
                status=r["status"],
                httpStatus=r.get("http_status"),
                error=r.get("error"),
                attempt=r["attempt"],
                scheduledAt=r["scheduled_at"].isoformat() if r.get("scheduled_at") else None,
                sentAt=r["sent_at"].isoformat() if r.get("sent_at") else None,
                createdAt=r["created_at"].isoformat()
            )
            for r in retries
        ]


@router.post("/{alert_id}/actions/preview", response_model=List[RouteDecision])
async def preview_routing(alert_id: int, user=Depends(get_user)):
    """Preview which routes would fire for an alert (viewer+)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Get alert
        alert = await get_alert(alert_id)
        if not alert:
            raise HTTPException(status_code=404, detail="Alert not found")
        
        # Get rule and route
        rule = await get_rule(conn, alert["rule_id"])
        if not rule:
            raise HTTPException(status_code=404, detail="Rule not found")
        
        route_config = rule.get("route") or rule.get("actions_json")
        if isinstance(route_config, str):
            route_config = json.loads(route_config)
        
        # Preview routes
        decisions = preview_routes(alert, route_config)
        
        # Increment metrics
        for decision in decisions:
            if decision["wouldSend"]:
                alert_actions_preview_total.labels(result="would_send").inc()
            elif decision["suppressed"]:
                alert_actions_preview_total.labels(result="suppressed").inc()
        
        return [
            RouteDecision(
                dest=d["dest"],
                wouldSend=d["wouldSend"],
                reason=d["reason"],
                suppressed=d["suppressed"]
            )
            for d in decisions
        ]

