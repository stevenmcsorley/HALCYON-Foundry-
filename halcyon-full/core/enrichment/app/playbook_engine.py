"""Playbook engine for executing multi-step playbooks."""
import asyncio
import json
import re
from typing import Dict, Any, List, Optional
from datetime import datetime
import logging
from .enrichment_engine import execute_action, _flatten_dict
from .metrics import playbook_runs_total, playbook_step_fail_total

logger = logging.getLogger("enrichment.playbook")


def _template_string(template: str, context: Dict[str, Any]) -> str:
    """Replace template variables in string."""
    result = template
    flat_context = _flatten_dict(context)
    for key, value in flat_context.items():
        placeholder = f"${{{key}}}"
        if placeholder in result:
            result = result.replace(placeholder, str(value))
    return result


async def execute_step(
    step: Dict[str, Any],
    context: Dict[str, Any],
    action_registry: Dict[str, Dict[str, Any]]
) -> Dict[str, Any]:
    """Execute a single playbook step."""
    step_kind = step.get("kind")
    step_id = step.get("stepId") or step_kind
    on_error = step.get("onError", "continue")
    
    start_time = datetime.utcnow()
    step_result = {
        "stepId": step_id,
        "kind": step_kind,
        "status": "pending",
        "startedAt": start_time.isoformat() + "Z",
        "finishedAt": None,
        "output": None,
        "error": None,
        "durationMs": 0
    }
    
    try:
        if step_kind == "enrich":
            action_id = step.get("actionId")
            if not action_id:
                raise ValueError("enrich step requires actionId")
            
            action = action_registry.get(action_id)
            if not action:
                raise ValueError(f"Action {action_id} not found")
            
            # Get config - handle both "config" and "config_json" field names
            action_config = action.get("config") or action.get("config_json", {})
            
            output = await execute_action(
                action_id,
                action["kind"],
                action_config,
                context["subject"]
            )
            
            # Check if output contains an error
            if isinstance(output, dict) and "error" in output:
                step_result["status"] = "failed"
                step_result["error"] = output.get("error", "Unknown error")
                step_result["output"] = output
            else:
                step_result["output"] = output
                step_result["status"] = "success"
            
            # Add output to context for next steps
            context["run"]["output"] = output
            context["run"]["steps"] = context["run"].get("steps", [])
            context["run"]["steps"].append(step_result)
        
        elif step_kind == "attach_note":
            # This would integrate with Gateway API to attach note
            # For now, just mark as success
            note_text = _template_string(step.get("text", ""), context)
            step_result["output"] = {"note": note_text}
            step_result["status"] = "success"
        
        elif step_kind == "set_alert_priority":
            # This would integrate with Gateway API
            priority = step.get("priority")
            step_result["output"] = {"priority": priority}
            step_result["status"] = "success"
        
        elif step_kind == "route_preview":
            # This would call Gateway API for route preview
            step_result["output"] = {"preview": "route preview result"}
            step_result["status"] = "success"
        
        elif step_kind == "route_retry":
            # This would call Gateway API for route retry
            step_result["output"] = {"retry": "scheduled"}
            step_result["status"] = "success"
        
        else:
            raise ValueError(f"Unknown step kind: {step_kind}")
        
    except Exception as e:
        step_result["status"] = "failed"
        step_result["error"] = str(e)
        logger.error(f"Step {step_id} failed: {e}", exc_info=True)
        
        if on_error == "fail":
            raise
        # else continue
    
    finally:
        finished_time = datetime.utcnow()
        step_result["finishedAt"] = finished_time.isoformat() + "Z"
        step_result["durationMs"] = int((finished_time - start_time).total_seconds() * 1000)
    
    return step_result


async def execute_playbook(
    playbook: Dict[str, Any],
    subject: Dict[str, Any],
    action_registry: Dict[str, Dict[str, Any]]
) -> Dict[str, Any]:
    """Execute a playbook with all steps."""
    playbook_id = playbook["id"]
    # Handle both "steps" and "steps_json" field names
    steps = playbook.get("steps") or playbook.get("steps_json", [])
    
    # Ensure steps is a list
    if not isinstance(steps, list):
        logger.error(f"Playbook {playbook_id} steps is not a list: {type(steps)} - {steps}")
        steps = []
    
    context = {
        "subject": subject,
        "playbook": playbook,
        "run": {
            "steps": [],
            "output": {}
        }
    }
    
    start_time = datetime.utcnow()
    step_results = []
    overall_status = "success"
    
    logger.info(f"Playbook {playbook_id}: Starting execution with {len(steps)} steps")
    
    if not steps:
        logger.error(f"Playbook {playbook_id} has no steps to execute!")
        return {
            "status": "failed",
            "steps": [],
            "output": {
                "steps": [],
                "summary": {"total": 0, "success": 0, "failed": 0}
            },
            "startedAt": start_time.isoformat() + "Z",
            "finishedAt": datetime.utcnow().isoformat() + "Z",
            "durationMs": 0,
            "error": "Playbook has no steps to execute"
        }
    
    try:
        for idx, step in enumerate(steps):
            logger.info(f"Playbook {playbook_id}: Executing step {idx + 1}/{len(steps)}: {step.get('kind', 'unknown')} (actionId: {step.get('actionId', 'N/A')})")
            step_result = await execute_step(step, context, action_registry)
            step_results.append(step_result)
            logger.info(f"Playbook {playbook_id}: Step {idx + 1} completed with status: {step_result['status']}")
            
            if step_result["status"] == "failed":
                playbook_step_fail_total.labels(playbook=playbook_id, step=step_result["stepId"]).inc()
                # If step has onError=fail, we would have raised already
                # For continue, we mark overall as failed but continue
                overall_status = "failed"
        
    except Exception as e:
        overall_status = "failed"
        logger.error(f"Playbook {playbook_id} failed: {e}", exc_info=True)
    
    finished_time = datetime.utcnow()
    duration_ms = int((finished_time - start_time).total_seconds() * 1000)
    
    # Aggregate output from all steps
    aggregated_output = {
        "steps": step_results,
        "summary": {
            "total": len(step_results),
            "success": sum(1 for s in step_results if s["status"] == "success"),
            "failed": sum(1 for s in step_results if s["status"] == "failed")
        }
    }
    
    playbook_runs_total.labels(playbook=playbook_id, status=overall_status).inc()
    
    return {
        "status": overall_status,
        "steps": step_results,
        "output": aggregated_output,
        "startedAt": start_time.isoformat() + "Z",
        "finishedAt": finished_time.isoformat() + "Z",
        "durationMs": duration_ms
    }

