from ariadne import QueryType, MutationType
from .ws_pubsub import hub
from .config import settings

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
  request = context["request"]
  
  # Extract roles from header or use defaults
  roles_header = request.headers.get("x-roles", None) if hasattr(request, "headers") else None
  roles = [r.strip() for r in roles_header.split(",")] if roles_header else settings.default_roles
  
  if not await policy.allowed({"action":"write_entities","count":len(input),"roles":roles}): return False
  await ont.upsert_entities(input)
  
  # Publish to Redis for WebSocket broadcasting
  for e in input:
    await hub.publish({"t": "entity.upsert", "data": e})
  
  return True

@mutation.field("upsertRelationships")
async def resolve_upsert_relationships(obj, info, input):
  context = info.context
  policy, ont = context["policy"], context["ontology"]
  request = context["request"]
  
  # Extract roles from header or use defaults
  roles_header = request.headers.get("x-roles", None) if hasattr(request, "headers") else None
  roles = [r.strip() for r in roles_header.split(",")] if roles_header else settings.default_roles
  
  if not await policy.allowed({"action":"write_relationships","count":len(input),"roles":roles}): return False
  # Convert GraphQL camelCase to snake_case for ontology service
  converted = [{"type": r["type"], "from_id": r["fromId"], "to_id": r["toId"], "attrs": r.get("attrs", {})} for r in input]
  await ont.upsert_relationships(converted)
  
  # Publish to Redis for WebSocket broadcasting
  for r in input:
    await hub.publish({"t": "relationship.upsert", "data": r})
  
  return True
