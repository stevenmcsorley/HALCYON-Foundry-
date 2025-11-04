from typing import Dict, List, Any, Optional
from collections import deque
import logging

logger = logging.getLogger("registry.cache")

# Global cache: {connector_id: deque([raw_doc1, raw_doc2, ...])}
_source_cache: Dict[str, deque] = {}
_cache_size = 200  # Keep last 200 documents per connector


def store_raw_document(connector_id: str, raw_doc: Dict[str, Any]) -> None:
    """Store a raw document in the source cache."""
    if connector_id not in _source_cache:
        _source_cache[connector_id] = deque(maxlen=_cache_size)
    
    _source_cache[connector_id].append(raw_doc)


def get_raw_documents(connector_id: str, limit: int = 200) -> List[Dict[str, Any]]:
    """Get cached raw documents for a connector."""
    if connector_id not in _source_cache:
        return []
    
    # Return most recent documents
    cache = _source_cache[connector_id]
    return list(cache)[-limit:]


def get_all_sources() -> List[str]:
    """Get list of all connector IDs that have cached data."""
    return list(_source_cache.keys())
