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
