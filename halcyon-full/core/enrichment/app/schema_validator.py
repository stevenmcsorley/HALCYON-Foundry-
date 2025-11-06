"""Playbook JSON schema validation."""
from typing import Dict, Any, List, Optional
import json
import logging

logger = logging.getLogger("enrichment.schema")


# Playbook step schema
STEP_SCHEMA = {
    "type": "object",
    "required": ["kind"],
    "properties": {
        "kind": {
            "type": "string",
            "enum": ["enrich", "attach_note", "set_alert_priority", "route_preview", "route_retry", "wait", "condition", "branch"]
        },
        "stepId": {"type": "string"},
        "actionId": {"type": "string"},  # Required if kind == "enrich"
        "onError": {
            "type": "string",
            "enum": ["continue", "fail"],
            "default": "continue"
        },
        "text": {"type": "string"},  # For attach_note
        "priority": {"type": "string"},  # For set_alert_priority
        "condition": {"type": "string"},  # For condition/branch
        "waitSeconds": {"type": "number"},  # For wait
        "config": {"type": "object"}  # Optional step-specific config
    }
}

# Playbook schema
PLAYBOOK_SCHEMA = {
    "type": "object",
    "required": ["steps"],
    "properties": {
        "name": {"type": "string"},
        "description": {"type": "string"},
        "steps": {
            "type": "array",
            "items": STEP_SCHEMA,
            "minItems": 1
        },
        "metadata": {
            "type": "object",
            "properties": {
                "tags": {"type": "array", "items": {"type": "string"}},
                "author": {"type": "string"},
                "version": {"type": "string"}
            }
        }
    }
}


def validate_step(step: Dict[str, Any]) -> tuple[bool, Optional[str]]:
    """Validate a single playbook step."""
    if not isinstance(step, dict):
        return False, "Step must be an object"
    
    if "kind" not in step:
        return False, "Step must have a 'kind' field"
    
    kind = step["kind"]
    
    # Validate kind-specific requirements
    if kind == "enrich":
        if "actionId" not in step:
            return False, "Enrich step requires 'actionId'"
    
    if kind == "attach_note":
        if "text" not in step:
            return False, "Attach note step requires 'text'"
    
    if kind == "set_alert_priority":
        if "priority" not in step:
            return False, "Set alert priority step requires 'priority'"
    
    if kind == "wait":
        if "waitSeconds" not in step:
            return False, "Wait step requires 'waitSeconds'"
    
    if kind in ["condition", "branch"]:
        if "condition" not in step:
            return False, f"{kind} step requires 'condition'"
    
    # Validate onError
    if "onError" in step and step["onError"] not in ["continue", "fail"]:
        return False, "onError must be 'continue' or 'fail'"
    
    return True, None


def validate_playbook(json_body: Dict[str, Any], allow_empty_steps: bool = False) -> tuple[bool, Optional[str], List[str]]:
    """
    Validate a playbook JSON structure.
    Returns (is_valid, error_message, warnings).
    
    Args:
        json_body: The playbook JSON to validate
        allow_empty_steps: If True, allow playbooks with no steps (for drafts)
    """
    warnings = []
    
    if not isinstance(json_body, dict):
        return False, "Playbook must be an object", []
    
    if "steps" not in json_body:
        return False, "Playbook must have a 'steps' array", []
    
    steps = json_body["steps"]
    if not isinstance(steps, list):
        return False, "Playbook 'steps' must be an array", []
    
    if len(steps) == 0 and not allow_empty_steps:
        return False, "Playbook must have at least one step", []
    
    # Validate each step
    for i, step in enumerate(steps):
        is_valid, error = validate_step(step)
        if not is_valid:
            return False, f"Step {i+1}: {error}", []
        
        # Add warnings for common issues
        if step.get("kind") == "enrich" and not step.get("stepId"):
            warnings.append(f"Step {i+1}: Consider adding a 'stepId' for better traceability")
    
    return True, None, warnings


def validate_playbook_json(json_string: str) -> tuple[bool, Optional[str], List[str]]:
    """Validate a playbook from JSON string."""
    try:
        json_body = json.loads(json_string)
        return validate_playbook(json_body)
    except json.JSONDecodeError as e:
        return False, f"Invalid JSON: {str(e)}", []

