from typing import Dict, List, Any, Optional
import os
import logging

logger = logging.getLogger("gateway.er")

# Similarity threshold for merging candidates (default 0.92)
ER_SIM_THRESHOLD = float(os.getenv("ER_SIM_THRESHOLD", "0.92"))


try:
    from rapidfuzz.distance import JaroWinkler
    SIMILARITY_AVAILABLE = True
except ImportError:
    try:
        from jellyfish import jaro_winkler_similarity as jaro_winkler
        SIMILARITY_AVAILABLE = True
        
        def JaroWinkler(s1: str, s2: str) -> float:
            """Wrapper for jellyfish jaro_winkler_similarity."""
            return jaro_winkler(s1, s2)
    except ImportError:
        SIMILARITY_AVAILABLE = False
        logger.warning("No similarity library available. Install 'rapidfuzz' or 'jellyfish' for similarity-based ER")


def deterministic_key(entity: Dict[str, Any]) -> Optional[str]:
    """
    Extract deterministic key from entity attributes.
    
    Prefer externalId > ip > email > name (first available).
    
    Returns:
        Key string or None if no deterministic key found
    """
    attrs = entity.get("attrs", {})
    
    # Priority order for deterministic keys
    key_fields = ["externalId", "external_id", "ip", "email", "name"]
    
    for field in key_fields:
        value = attrs.get(field)
        if value:
            return str(value)
    
    return None


def similarity_score(name1: str, name2: str) -> float:
    """Calculate Jaro-Winkler similarity between two names."""
    if not SIMILARITY_AVAILABLE:
        return 0.0
    
    try:
        if isinstance(JaroWinkler, type):
            # rapidfuzz
            return JaroWinkler.normalized_similarity(name1.lower(), name2.lower())
        else:
            # jellyfish wrapper
            return JaroWinkler(name1.lower(), name2.lower())
    except Exception as e:
        logger.debug(f"Similarity calculation error: {e}")
        return 0.0


def resolve_entities(
    candidates: List[Dict[str, Any]],
    use_similarity: bool = True
) -> List[Dict[str, Any]]:
    """
    Resolve duplicate entities from a list of candidates.
    
    Uses deterministic keys first, then similarity matching on 'name' attribute.
    
    Args:
        candidates: List of candidate entities with {id, type, attrs}
        use_similarity: Whether to use similarity-based matching
    
    Returns:
        List of resolved entities (merged duplicates)
    """
    resolved: Dict[str, Dict[str, Any]] = {}
    resolved_keys: Dict[str, str] = {}  # key -> resolved_id
    
    # Phase 1: Deterministic key matching
    for candidate in candidates:
        key = deterministic_key(candidate)
        if key:
            if key in resolved_keys:
                # Merge with existing entity
                existing_id = resolved_keys[key]
                resolved[existing_id] = _merge_entities(resolved[existing_id], candidate)
            else:
                # New entity with deterministic key
                resolved[candidate["id"]] = candidate.copy()
                resolved_keys[key] = candidate["id"]
        else:
            # No deterministic key - add to resolved for similarity check
            resolved[candidate["id"]] = candidate.copy()
    
    # Phase 2: Similarity-based matching (if enabled)
    if use_similarity and SIMILARITY_AVAILABLE:
        resolved_list = list(resolved.values())
        merged = set()
        
        for i, ent1 in enumerate(resolved_list):
            if ent1["id"] in merged:
                continue
            
            name1 = ent1.get("attrs", {}).get("name")
            if not name1:
                continue
            
            for j, ent2 in enumerate(resolved_list[i+1:], start=i+1):
                if ent2["id"] in merged:
                    continue
                
                name2 = ent2.get("attrs", {}).get("name")
                if not name2:
                    continue
                
                score = similarity_score(name1, name2)
                if score >= ER_SIM_THRESHOLD:
                    # Merge ent2 into ent1
                    resolved[ent1["id"]] = _merge_entities(ent1, ent2)
                    merged.add(ent2["id"])
                    del resolved[ent2["id"]]
    
    return list(resolved.values())


def _merge_entities(ent1: Dict[str, Any], ent2: Dict[str, Any]) -> Dict[str, Any]:
    """Merge two entities, preferring ent1's values but combining attrs."""
    merged = ent1.copy()
    merged_attrs = ent1.get("attrs", {}).copy()
    
    # Merge attrs (ent1 takes precedence)
    for key, value in ent2.get("attrs", {}).items():
        if key not in merged_attrs:
            merged_attrs[key] = value
    
    merged["attrs"] = merged_attrs
    return merged
