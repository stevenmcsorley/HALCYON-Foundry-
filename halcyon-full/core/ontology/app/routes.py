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
    
    # Publish to Redis for WebSocket broadcasting (same as Gateway mutation)
    try:
        import redis.asyncio as redis
        import json
        import os
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        channel = os.getenv("WS_CHANNEL", "halcyon.stream")
        r = redis.from_url(redis_url, decode_responses=True)
        for entity in payload:
            msg = {"t": "entity.upsert", "data": {"id": entity.id, "type": entity.type, "attrs": entity.attrs or {}}}
            await r.publish(channel, json.dumps(msg))
        await r.aclose()
    except Exception as e:
        # Log but don't fail - Redis publishing is best-effort
        import logging
        logging.getLogger("ontology").warning(f"Failed to publish to Redis: {e}")
    
    return


@router.post("/relationships:upsert", status_code=204)
async def upsert_relationships(payload: list[RelationshipInstance], graph: GraphStore = Depends(get_graph)):
    await graph.upsert_relationships(payload)
    return


@router.get("/entities")
async def get_entities(
    entity_type: str | None = None,
    sort: str = "timestamp",
    order: str = "desc",
    limit: int | None = None,
    cursor: str | None = None,
    graph: GraphStore = Depends(get_graph)
):
    """
    Get entities with sorting, ordering, limit, and cursor support.
    Default: sort by timestamp desc (newest first).
    """
    entities = await graph.get_entities(
        entity_type=entity_type,
        sort=sort,
        order=order,
        limit=limit,
        cursor=cursor
    )
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


@router.get("/events/playback")
async def events_playback(
    start_ts: str | None = None,
    end_ts: str | None = None,
    limit: int = 1000,
    graph: GraphStore = Depends(get_graph)
):
    """
    Get ordered events for playback.
    Returns events (id, type, attrs, timestamp) sorted by timestamp ascending.
    """
    cypher = """
    MATCH (e:Event)
    WHERE e.timestamp IS NOT NULL
    """
    params = {"limit": limit}
    
    if start_ts:
        cypher += " AND e.timestamp >= $start_ts\n"
        params["start_ts"] = start_ts
    if end_ts:
        cypher += " AND e.timestamp <= $end_ts\n"
        params["end_ts"] = end_ts
    
    cypher += """
    RETURN e.id as id, labels(e)[0] as type, properties(e) as attrs, e.timestamp as timestamp
    ORDER BY e.timestamp ASC
    LIMIT $limit
    """
    
    async with graph._driver.session() as session:
        result = await session.run(cypher, **params)
        events = []
        for record in await result.data():
            attrs = dict(record["attrs"])
            attrs.pop("id", None)
            attrs.pop("timestamp", None)
            events.append({
                "id": record["id"],
                "type": record["type"],
                "attrs": attrs,
                "timestamp": record["timestamp"],
            })
        return events


@router.get("/graph/at")
async def graph_at(
    ts: str,
    ids: str | None = None,  # Comma-separated entity IDs
    graph: GraphStore = Depends(get_graph)
):
    """
    Get lightweight point-in-time state snapshot.
    Returns entity/relationship snapshots that exist at or before the given timestamp.
    """
    entity_ids = [eid.strip() for eid in ids.split(",")] if ids else []
    
    cypher_nodes = """
    MATCH (n)
    WHERE n.timestamp IS NOT NULL AND n.timestamp <= $ts
    """
    if entity_ids:
        cypher_nodes += " AND n.id IN $ids\n"
    
    cypher_nodes += """
    RETURN n.id as id, labels(n)[0] as type, properties(n) as attrs
    ORDER BY n.timestamp DESC
    """
    
    cypher_rels = """
    MATCH (a)-[r]->(b)
    WHERE (r.timestamp IS NOT NULL AND r.timestamp <= $ts) OR r.timestamp IS NULL
    """
    if entity_ids:
        cypher_rels += " AND (a.id IN $ids OR b.id IN $ids)\n"
    
    cypher_rels += """
    RETURN a.id as from_id, type(r) as type, b.id as to_id, properties(r) as attrs
    """
    
    params = {"ts": ts}
    if entity_ids:
        params["ids"] = entity_ids
    
    async with graph._driver.session() as session:
        nodes_result = await session.run(cypher_nodes, **params)
        nodes = []
        for record in await nodes_result.data():
            attrs = dict(record["attrs"])
            attrs.pop("id", None)
            attrs.pop("timestamp", None)
            nodes.append({
                "id": record["id"],
                "type": record["type"],
                "attrs": attrs,
            })
        
        rels_result = await session.run(cypher_rels, **params)
        relationships = []
        for record in await rels_result.data():
            attrs = dict(record["attrs"])
            attrs.pop("timestamp", None)
            relationships.append({
                "from_id": record["from_id"],
                "type": record["type"],
                "to_id": record["to_id"],
                "attrs": attrs,
            })
        
        return {"entities": nodes, "relationships": relationships}
