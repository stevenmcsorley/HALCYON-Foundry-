"""GraphQL resolvers for alert actions and delivery trace."""
from ariadne import QueryType, MutationType
from .db import get_pool
from .repo_actions import list_action_logs, enqueue_manual_retry, get_failed_destinations
from .repo_alerts import get_alert, get_rule
from .routing_preview import preview_routes
from .metrics import alert_actions_preview_total, alert_manual_retry_total
import json

actions_query = QueryType()
actions_mutation = MutationType()


@actions_query.field("alertActions")
async def resolve_alert_actions(obj, info, alertId: int):
    """Get action log timeline for an alert (viewer+)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        logs = await list_action_logs(conn, alertId)
        return [
            {
                "id": l["id"],
                "alertId": l["alert_id"],
                "dest": l["dest"],
                "status": l["status"],
                "httpStatus": l.get("http_status"),
                "error": l.get("error"),
                "attempt": l["attempt"],
                "scheduledAt": l["scheduled_at"].isoformat() if l.get("scheduled_at") else None,
                "sentAt": l["sent_at"].isoformat() if l.get("sent_at") else None,
                "createdAt": l["created_at"].isoformat()
            }
            for l in logs
        ]


@actions_query.field("alertRoutePreview")
async def resolve_alert_route_preview(obj, info, alertId: int):
    """Preview which routes would fire for an alert (viewer+)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Get alert
        alert = await get_alert(alertId)
        if not alert:
            return []
        
        # Get rule and route
        rule = await get_rule(conn, alert["rule_id"])
        if not rule:
            return []
        
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
            {
                "dest": d["dest"],
                "wouldSend": d["wouldSend"],
                "reason": d["reason"],
                "suppressed": d["suppressed"]
            }
            for d in decisions
        ]


@actions_mutation.field("alertRetry")
async def resolve_alert_retry(obj, info, alertId: int, dest: str):
    """Enqueue a manual retry for a specific destination (analyst/admin only)."""
    user = info.context.get("user", {})
    roles = user.get("roles", [])
    
    # RBAC: analyst or admin required
    if not any(r in roles for r in ["analyst", "admin"]):
        raise PermissionError("Analyst or admin role required")
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Verify alert exists
        alert = await get_alert(alertId)
        if not alert:
            raise ValueError("Alert not found")
        
        # Enqueue retry
        retry_log = await enqueue_manual_retry(
            conn, alertId, dest, f"Manual retry by {user.get('sub')}", user.get("sub")
        )
        
        alert_manual_retry_total.labels(dest=dest).inc()
        
        return {
            "id": retry_log["id"],
            "alertId": retry_log["alert_id"],
            "dest": retry_log["dest"],
            "status": retry_log["status"],
            "httpStatus": retry_log.get("http_status"),
            "error": retry_log.get("error"),
            "attempt": retry_log["attempt"],
            "scheduledAt": retry_log["scheduled_at"].isoformat() if retry_log.get("scheduled_at") else None,
            "sentAt": retry_log["sent_at"].isoformat() if retry_log.get("sent_at") else None,
            "createdAt": retry_log["created_at"].isoformat()
        }


@actions_mutation.field("alertRetryAllFailed")
async def resolve_alert_retry_all_failed(obj, info, alertId: int):
    """Retry all failed destinations for an alert (analyst/admin only)."""
    user = info.context.get("user", {})
    roles = user.get("roles", [])
    
    # RBAC: analyst or admin required
    if not any(r in roles for r in ["analyst", "admin"]):
        raise PermissionError("Analyst or admin role required")
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Verify alert exists
        alert = await get_alert(alertId)
        if not alert:
            raise ValueError("Alert not found")
        
        # Get failed destinations
        failed_dests = await get_failed_destinations(conn, alertId)
        
        if not failed_dests:
            return []
        
        # Enqueue retries for each failed destination
        retries = []
        for dest in failed_dests:
            retry_log = await enqueue_manual_retry(
                conn, alertId, dest, f"Bulk retry by {user.get('sub')}", user.get("sub")
            )
            retries.append(retry_log)
            alert_manual_retry_total.labels(dest=dest).inc()
        
        return [
            {
                "id": r["id"],
                "alertId": r["alert_id"],
                "dest": r["dest"],
                "status": r["status"],
                "httpStatus": r.get("http_status"),
                "error": r.get("error"),
                "attempt": r["attempt"],
                "scheduledAt": r["scheduled_at"].isoformat() if r.get("scheduled_at") else None,
                "sentAt": r["sent_at"].isoformat() if r.get("sent_at") else None,
                "createdAt": r["created_at"].isoformat()
            }
            for r in retries
        ]

