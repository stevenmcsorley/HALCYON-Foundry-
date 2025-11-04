import httpx
import jsonpath_ng
from typing import Dict, List, Any, Optional
import logging
from .config import settings

logger = logging.getLogger("gateway.federation")


async def get_source_mapping(registry_url: str, source_id: str) -> Optional[Dict[str, Any]]:
    """Fetch plugin.yaml mapping configuration from Registry."""
    try:
        async with httpx.AsyncClient(base_url=registry_url, timeout=10) as client:
            response = await client.get(f"/sources/{source_id}/config")
            if response.status_code == 404:
                return None
            response.raise_for_status()
            config = response.json()
            return config.get("mapping")
    except Exception as e:
        logger.error(f"Failed to fetch mapping config from Registry: {e}")
        return None


def apply_mapping(raw_doc: Dict[str, Any], mapping: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Apply mapping rules to raw document to create virtual entity."""
    entity_type = mapping.get("entity_type", "Event")
    id_path = mapping.get("id", "$.id")
    
    # Extract ID using JSONPath
    id_value = _extract_jsonpath(raw_doc, id_path)
    if not id_value:
        id_value = f"virtual-{hash(str(raw_doc)) % 1000000}"

    # Extract attributes
    attrs = {}
    attrs_mapping = mapping.get("attrs", {})
    for key, path in attrs_mapping.items():
        value = _extract_jsonpath(raw_doc, path)
        if value is not None:
            attrs[key] = value

    return {
        "id": str(id_value),
        "type": entity_type,
        "attrs": attrs,
    }


def _extract_jsonpath(data: Dict[str, Any], path: str) -> Any:
    """Extract value using JSONPath expression."""
    try:
        jsonpath_expr = jsonpath_ng.parse(path)
        matches = jsonpath_expr.find(data)
        if matches:
            return matches[0].value
    except Exception as e:
        logger.debug(f"JSONPath error for {path}: {e}")
    return None


async def federated_entities(
    registry_url: str,
    source: str,
    entity_type: Optional[str] = None,
    limit: int = 200,
    mapping: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """
    Fetch virtual entities from a source connector cache.
    
    Args:
        registry_url: Registry service base URL
        source: Connector/source ID
        entity_type: Filter by entity type (optional, applied after mapping)
        limit: Maximum number of entities to return
        mapping: Mapping configuration (if None, will try to fetch from Registry)
    
    Returns:
        List of virtual entities (not persisted)
    """
    # Fetch mapping if not provided
    if not mapping:
        mapping = await get_source_mapping(registry_url, source)
        if not mapping:
            logger.warning(f"No mapping found for source {source}")
            return []
    
    try:
        # Fetch raw documents from Registry cache
        async with httpx.AsyncClient(base_url=registry_url, timeout=10) as client:
            response = await client.get(f"/sources/{source}/cache", params={"limit": limit})
            if response.status_code == 404:
                logger.warning(f"Source {source} not found or has no cached data")
                return []
            response.raise_for_status()
            raw_docs = response.json()
    except Exception as e:
        logger.error(f"Failed to fetch raw documents from Registry: {e}")
        return []
    
    # Apply mapping to each raw document
    entities = []
    for raw_doc in raw_docs:
        mapped = apply_mapping(raw_doc, mapping)
        if mapped:
            # Filter by entity_type if specified
            if entity_type and mapped["type"] != entity_type:
                continue
            entities.append(mapped)
    
    return entities[:limit]
