from ariadne import QueryType, MutationType

query = QueryType(); mutation = MutationType()

@query.field("health")
def resolve_health(*_): return "ok"

@mutation.field("upsertEntities")
async def resolve_upsert_entities(obj, info, input):
  context = info.context
  policy, ont = context["policy"], context["ontology"]
  if not await policy.allowed({"action":"write_entities","count":len(input)}): return False
  await ont.upsert_entities(input); return True

@mutation.field("upsertRelationships")
async def resolve_upsert_relationships(obj, info, input):
  context = info.context
  policy, ont = context["policy"], context["ontology"]
  if not await policy.allowed({"action":"write_relationships","count":len(input)}): return False
  await ont.upsert_relationships(input); return True
