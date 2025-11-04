from ariadne import QueryType, MutationType
from .ws_pubsub import hub
from .config import settings
from .repo_alerts import list_rules, insert_alert
from .rule_engine import event_matches, within_window, render_message
from .actions import exec_slack, exec_webhook
import asyncio

query = QueryType(); mutation = MutationType()

async def _run_rules_and_publish(entities):
    """Evaluate alert rules against entities and publish alerts."""
    if not settings.actions_enable:
        return
    
    rules = await list_rules()
    for r in rules:
        if not r.get("enabled", True):
            continue
        cond = r["condition_json"]
        for entity in entities:
            if event_matches(cond, entity) and within_window(int(r["id"]), cond, entity):
                msg = render_message(cond, entity)
                alert_id = await insert_alert(int(r["id"]), msg, r.get("severity", "medium"), entity.get("id"))
                
                # Publish alert.created via WebSocket
                await hub.publish({"t": "alert.created", "data": {
                    "id": alert_id,
                    "ruleId": int(r["id"]),
                    "entityId": entity.get("id"),
                    "message": msg,
                    "severity": r.get("severity", "medium"),
                    "status": "new",
                    "createdAt": entity.get("attrs", {}).get("timestamp") or entity.get("updatedAt", "")
                }})
                
                # Execute actions asynchronously
                if r.get("actions_json"):
                    for a in r["actions_json"]:
                        t = a.get("type")
                        if t == "slack":
                            asyncio.create_task(exec_slack(alert_id, a.get("config", {}), msg))
                        elif t == "webhook":
                            asyncio.create_task(exec_webhook(alert_id, a.get("config", {}), {
                                "alertId": alert_id,
                                "message": msg,
                                "entity": entity
                            }))

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
