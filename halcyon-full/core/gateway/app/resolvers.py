from ariadne import QueryType, MutationType
from .ws_pubsub import hub
from .config import settings
from .rule_engine import event_matches, within_window, render_message, render_fingerprint, compute_group_key, is_suppressed
from .repo_alerts import list_rules, upsert_alert, get_alert
from .repo_suppress import mark_alert_suppressed
from .actions import dispatch_on_create
from .metrics import alerts_created_total, alerts_deduped_total, alerts_suppressed_total
import asyncio
from .autorun import evaluate_bindings

query = QueryType(); mutation = MutationType()

@query.field("health")
def resolve_health(*_): return "ok"

@query.field("entities")
async def resolve_entities(obj, info, type: str | None = None):
    context = info.context
    ont = context["ontology"]
    entities = await ont.get_entities(type)
    return entities

@query.field("entityById")
async def resolve_entity_by_id(obj, info, id: str):
    context = info.context
    ont = context["ontology"]
    entity = await ont.get_entity(id)
    return entity

@query.field("relationships")
async def resolve_relationships(obj, info):
    context = info.context
    ont = context["ontology"]
    relationships = await ont.get_relationships()
    return relationships

@mutation.field("upsertEntities")
async def resolve_upsert_entities(obj, info, input):
  context = info.context
  policy, ont = context["policy"], context["ontology"]
  
  # Extract roles from context user or use defaults
  user = context.get("user", {})
  roles = user.get("roles", settings.default_roles)
  
  if not await policy.allowed({"action":"write_entities","count":len(input),"roles":roles}): return False
  await ont.upsert_entities(input)
  
  # Publish to Redis for WebSocket broadcasting
  for e in input:
    await hub.publish({"t": "entity.upsert", "data": e})
  
  # Evaluate alert rules
  await _run_rules_and_publish(input)
  
  return True

@mutation.field("upsertRelationships")
async def resolve_upsert_relationships(obj, info, input):
  context = info.context
  policy, ont = context["policy"], context["ontology"]
  
  # Extract roles from context user or use defaults
  user = context.get("user", {})
  roles = user.get("roles", settings.default_roles)
  
  if not await policy.allowed({"action":"write_relationships","count":len(input),"roles":roles}): return False
  # Convert GraphQL camelCase to snake_case for ontology service
  converted = [{"type": r["type"], "from_id": r["fromId"], "to_id": r["toId"], "attrs": r.get("attrs", {})} for r in input]
  await ont.upsert_relationships(converted)
  
  # Publish to Redis for WebSocket broadcasting
  for r in input:
    await hub.publish({"t": "relationship.upsert", "data": r})
  
  return True

async def _run_rules_and_publish(entities):
    """Evaluate alert rules against entities and publish alerts."""
    # Always evaluate rules - actions_enable is checked in actions.py if needed

    rules = await list_rules()
    for r in rules:
        if not r.get("enabled", True):
            continue
        cond = r["condition_json"]
        mute_seconds = r.get("mute_seconds", 0) or 0
        fingerprint_template = r.get("fingerprint_template")
        correlation_keys = r.get("correlation_keys")

        for entity in entities:
            if event_matches(cond, entity) and within_window(int(r["id"]), cond, entity):
                msg = render_message(cond, entity)
                fingerprint = render_fingerprint(fingerprint_template, entity, cond)
                group_key = compute_group_key(correlation_keys, entity)

                # Check suppression before creating/updating alert
                suppression = await is_suppressed(entity)
                is_suppressed_flag = suppression is not None

                # Upsert alert (creates new or dedupes existing)
                alert_id, was_created = await upsert_alert(
                    int(r["id"]), msg, r.get("severity", "medium"),
                    fingerprint, entity.get("id"), group_key, mute_seconds
                )

                # Mark as suppressed if needed
                if is_suppressed_flag:
                    await mark_alert_suppressed(alert_id, suppression["kind"], suppression["id"])
                    alerts_suppressed_total.labels(kind=suppression["kind"], rule=str(r["id"])).inc()

                # Get full alert data for WebSocket message
                alert_data = await get_alert(alert_id)

                if was_created:
                    if not is_suppressed_flag:
                        alerts_created_total.labels(rule=str(r["id"])).inc()

                    # Publish alert.created via WebSocket (always, even if suppressed)
                    await hub.publish({"t": "alert.created", "data": {
                        "id": alert_id,
                        "ruleId": int(r["id"]),
                        "entityId": entity.get("id"),
                        "message": msg,
                        "severity": r.get("severity", "medium"),
                        "status": "open",
                        "fingerprint": fingerprint,
                        "groupKey": group_key,
                        "count": alert_data.get("count", 1) if alert_data else 1,
                        "firstSeen": alert_data.get("first_seen", "") if alert_data else "",
                        "lastSeen": alert_data.get("last_seen", "") if alert_data else "",
                        "createdAt": entity.get("attrs", {}).get("timestamp") or entity.get("updatedAt", ""),
                        "suppressedByKind": suppression["kind"] if is_suppressed_flag else None,
                        "suppressedById": suppression["id"] if is_suppressed_flag else None,
                        "suppressedByName": suppression["name"] if is_suppressed_flag else None,
                    }})

                    # Dispatch actions (only on create and NOT suppressed)
                    # PR-3: Use new dispatch_on_create which handles retries
                    if not is_suppressed_flag:
                        rule_route = r.get("route") or {}  # route JSONB from rule
                        alert_payload = {
                            "id": alert_id,
                            "message": msg,
                            "severity": r.get("severity", "medium"),
                            "count": alert_data.get("count", 1) if alert_data else 1,
                            "title": f"Alert: {msg[:50]}",
                        }
                        await dispatch_on_create(alert_payload, rule_route)

                    # Trigger playbook binding evaluation (on create, regardless of suppression)
                    binding_alert = dict(alert_data or {})
                    binding_alert["id"] = alert_id
                    binding_alert["ruleId"] = int(r["id"])
                    binding_alert["severity"] = r.get("severity", "medium")
                    binding_alert["entity"] = entity
                    if entity.get("attrs", {}).get("tags"):
                        binding_alert["tags"] = entity["attrs"].get("tags")
                    asyncio.create_task(evaluate_bindings(binding_alert, user="system"))
                else:
                    # Dedupe update: increment deduped metric and publish update
                    if not is_suppressed_flag:
                        alerts_deduped_total.labels(rule=str(r["id"])).inc()
                    # If suppressed, increment suppressed metric (even on dedupe)
                    if is_suppressed_flag:
                        alerts_suppressed_total.labels(kind=suppression["kind"], rule=str(r["id"])).inc()

                    # Publish alert.updated via WebSocket (includes updated count and suppression info)
                    await hub.publish({"t": "alert.updated", "data": {
                        "id": alert_id,
                        "ruleId": int(r["id"]),
                        "entityId": entity.get("id"),
                        "message": msg,
                        "severity": r.get("severity", "medium"),
                        "status": "open",
                        "fingerprint": fingerprint,
                        "groupKey": group_key,
                        "count": alert_data.get("count", 1) if alert_data else 1,
                        "firstSeen": alert_data.get("first_seen", "") if alert_data else "",
                        "lastSeen": alert_data.get("last_seen", "") if alert_data else "",
                        "createdAt": alert_data.get("created_at", "") if alert_data else "",
                        "suppressedByKind": suppression["kind"] if is_suppressed_flag else None,
                        "suppressedById": suppression["id"] if is_suppressed_flag else None,
                        "suppressedByName": suppression["name"] if is_suppressed_flag else None,
                    }})
