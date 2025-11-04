from fastapi import APIRouter, Depends
from .models import OntologyPatch, EntityInstance, RelationshipInstance
from .store import MetaStore, GraphStore

router = APIRouter()


def get_metastore() -> MetaStore:
    from .state import meta
    return meta


def get_graph() -> GraphStore:
    from .state import graph
    return graph


@router.post("/ontology/patch", status_code=204)
async def patch_ontology(patch: OntologyPatch, metastore: MetaStore = Depends(get_metastore)):
    if patch.add_entities:
        await metastore.register_entity_types(patch.add_entities)
    if patch.add_relationships:
        await metastore.register_relationship_types(patch.add_relationships)
    return


@router.post("/entities:upsert", status_code=204)
async def upsert_entities(payload: list[EntityInstance], graph: GraphStore = Depends(get_graph)):
    await graph.upsert_entities(payload)
    return


@router.post("/relationships:upsert", status_code=204)
async def upsert_relationships(payload: list[RelationshipInstance], graph: GraphStore = Depends(get_graph)):
    await graph.upsert_relationships(payload)
    return


@router.get("/entities")
async def get_entities(entity_type: str | None = None, graph: GraphStore = Depends(get_graph)):
    entities = await graph.get_entities(entity_type)
    return entities


@router.get("/entities/{entity_id}")
async def get_entity(entity_id: str, graph: GraphStore = Depends(get_graph)):
    entity = await graph.get_entity(entity_id)
    if not entity:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Entity not found")
    return entity


@router.get("/relationships")
async def get_relationships(graph: GraphStore = Depends(get_graph)):
    relationships = await graph.get_relationships()
    return relationships


@router.get("/events/counts")
async def event_counts(
    bucket: str = "hour",
    limit: int = 60,
    graph: GraphStore = Depends(get_graph)
):
    """
    Aggregate Event entities by timestamp bucket.
    Expects Event.attrs.timestamp as ISO string.
    Returns list of {ts: str, c: int} sorted by timestamp ascending.
    """
    # Simple time bucket truncation without APOC
    # Format: minute -> truncate to minute, hour -> truncate to hour, day -> truncate to day
    bucket_map = {"minute": 16, "hour": 13, "day": 10}  # ISO string truncation positions
    trunc_len = bucket_map.get(bucket, 13)
    
    cypher = """
    MATCH (e:Event)
    WHERE e.timestamp IS NOT NULL
    WITH substring(e.timestamp, 0, $truncLen) AS bucket
    RETURN bucket AS ts, count(*) AS c
    ORDER BY ts DESC
    LIMIT $limit
    """
    
    async with graph._driver.session() as session:
        result = await session.run(cypher, truncLen=trunc_len, limit=limit)
        rows = [dict(record) for record in await result.data()]
    
    # Reverse to get ascending order (oldest first)
    return list(reversed(rows))
