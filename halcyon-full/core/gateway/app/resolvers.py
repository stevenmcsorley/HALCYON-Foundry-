from ariadne import QueryType, MutationType

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

@query.field("entitiesByType")
async def resolve_entities_by_type(obj, info, type: str):
    context = info.context
    ont = context["ontology"]
    entities = await ont.get_entities(type)
    return entities

@query.field("relationships")
async def resolve_relationships(obj, info, type: str | None = None, fromId: str | None = None, toId: str | None = None):
    context = info.context
    ont = context["ontology"]
    relationships = await ont.get_relationships(type, fromId, toId)
    return relationships

@mutation.field("upsertEntities")
async def resolve_upsert_entities(obj, info, input):
  from .websocket import manager
  context = info.context
  policy, ont = context["policy"], context["ontology"]
  if not await policy.allowed({"action":"write_entities","count":len(input)}): return False
  await ont.upsert_entities(input)
  # Broadcast each entity to WebSocket clients
  for entity in input:
    await manager.broadcast_entity_upsert(entity)
  return True

@mutation.field("upsertRelationships")
async def resolve_upsert_relationships(obj, info, input):
  from .websocket import manager
  context = info.context
  policy, ont = context["policy"], context["ontology"]
  if not await policy.allowed({"action":"write_relationships","count":len(input)}): return False
  # Convert GraphQL camelCase to snake_case for ontology service
  converted = [{"type": r["type"], "from_id": r["fromId"], "to_id": r["toId"], "attrs": r.get("attrs", {})} for r in input]
  await ont.upsert_relationships(converted)
  # Broadcast each relationship to WebSocket clients
  for rel in input:
    await manager.broadcast_relationship_upsert(rel)
  return True
