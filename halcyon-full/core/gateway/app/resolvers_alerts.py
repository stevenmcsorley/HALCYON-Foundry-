from ariadne import QueryType, MutationType
from .repo_alerts import list_rules, list_alerts, create_rule, update_rule, delete_rule, ack_alert, resolve_alert
from .models import AlertRule, Alert
from .ws_pubsub import hub

alerts_query = QueryType()
alerts_mutation = MutationType()


@alerts_query.field("alertRules")
async def resolve_alert_rules(obj, info):
    """List all alert rules."""
    rules = await list_rules()
    return [AlertRule(**r) for r in rules]


@alerts_query.field("alerts")
async def resolve_alerts(obj, info, status: str | None = None, severity: str | None = None):
    """List alerts with optional filters."""
    alerts = await list_alerts(status, severity)
    return [Alert(**a) for a in alerts]


@alerts_mutation.field("createAlertRule")
async def resolve_create_alert_rule(obj, info, input):
    """Create a new alert rule."""
    context = info.context
    user = context.get("user", {})
    roles = user.get("roles", [])
    if "admin" not in roles:
        raise Exception("Insufficient permissions: admin role required")
    
    rule_dict = input
    rule_dict["created_by"] = user.get("sub", "anonymous")
    rid = await create_rule(rule_dict)
    rules = await list_rules()
    rule = next((r for r in rules if r["id"] == rid), None)
    if not rule:
        raise Exception("Failed to create rule")
    return AlertRule(**rule)


@alerts_mutation.field("updateAlertRule")
async def resolve_update_alert_rule(obj, info, id: int, input):
    """Update an alert rule."""
    context = info.context
    user = context.get("user", {})
    roles = user.get("roles", [])
    if "admin" not in roles:
        raise Exception("Insufficient permissions: admin role required")
    
    await update_rule(id, input)
    rules = await list_rules()
    rule = next((r for r in rules if r["id"] == id), None)
    if not rule:
        raise Exception("Rule not found")
    return AlertRule(**rule)


@alerts_mutation.field("deleteAlertRule")
async def resolve_delete_alert_rule(obj, info, id: int):
    """Delete an alert rule."""
    context = info.context
    user = context.get("user", {})
    roles = user.get("roles", [])
    if "admin" not in roles:
        raise Exception("Insufficient permissions: admin role required")
    
    await delete_rule(id)
    return True


@alerts_mutation.field("acknowledgeAlert")
async def resolve_acknowledge_alert(obj, info, id: int):
    """Acknowledge an alert."""
    context = info.context
    user = context.get("user", {})
    roles = user.get("roles", [])
    if "analyst" not in roles and "admin" not in roles:
        raise Exception("Insufficient permissions: analyst or admin role required")
    
    await ack_alert(id, user.get("sub", "anonymous"))
    await hub.publish({"t": "alert.updated", "data": {"id": id, "status": "ack"}})
    
    alerts = await list_alerts()
    alert = next((a for a in alerts if a["id"] == id), None)
    if not alert:
        raise Exception("Alert not found")
    return Alert(**alert)


@alerts_mutation.field("resolveAlert")
async def resolve_resolve_alert(obj, info, id: int):
    """Resolve an alert."""
    context = info.context
    user = context.get("user", {})
    roles = user.get("roles", [])
    if "admin" not in roles:
        raise Exception("Insufficient permissions: admin role required")
    
    await resolve_alert(id, user.get("sub", "anonymous"))
    await hub.publish({"t": "alert.updated", "data": {"id": id, "status": "resolved"}})
    
    alerts = await list_alerts()
    alert = next((a for a in alerts if a["id"] == id), None)
    if not alert:
        raise Exception("Alert not found")
    return Alert(**alert)
