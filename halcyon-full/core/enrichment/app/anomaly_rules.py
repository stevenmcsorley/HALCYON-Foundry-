from typing import Dict, List, Any, Optional
import yaml
import os

# Default rules
DEFAULT_RULES = [
    {
        "name": "http_5xx_spike",
        "match": {
            "attrs.severity": {"$in": ["high", "critical"]},
            "attrs.category": "http_5xx"
        },
        "window": "5m",
        "zscore_gt": 3.0,
        "emits": {
            "type": "Anomaly",
            "link_to": "Event"
        }
    }
]


def load_rules(rules_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """Load anomaly rules from YAML file or use defaults."""
    if rules_path and os.path.exists(rules_path):
        with open(rules_path, "r") as f:
            data = yaml.safe_load(f)
            return data.get("rules", DEFAULT_RULES)
    return DEFAULT_RULES


def match_rule(entity: Dict[str, Any], rule: Dict[str, Any]) -> bool:
    """Check if an entity matches a rule's match criteria."""
    match_criteria = rule.get("match", {})
    attrs = entity.get("attrs", {})
    
    for key, condition in match_criteria.items():
        # Handle nested keys like "attrs.severity"
        if key.startswith("attrs."):
            attr_key = key[6:]  # Remove "attrs." prefix
            value = attrs.get(attr_key)
        else:
            value = entity.get(key)
        
        # Handle $in operator
        if isinstance(condition, dict) and "$in" in condition:
            if value not in condition["$in"]:
                return False
        elif value != condition:
            return False
    
    return True
