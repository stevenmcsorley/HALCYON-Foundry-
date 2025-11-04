from ariadne import QueryType
from .federation import federated_entities
from .config import settings

fed_query = QueryType()


@fed_query.field("federatedEntities")
async def resolve_federated_entities(obj, info, source: str, type: str = None, limit: int = 200):
    """Resolve federatedEntities query - returns virtual entities from source connectors."""
    entities = await federated_entities(
        registry_url=settings.registry_base_url,
        source=source,
        entity_type=type,
        limit=limit
    )
    return entities
