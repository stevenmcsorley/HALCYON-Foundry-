"""API routes for Playbook Studio."""
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime
import uuid
import logging
from .repo_playbooks import (
    create_playbook, get_playbook, list_playbooks, update_playbook,
    delete_playbook, get_playbook_versions, get_playbook_version,
    rollback_playbook
)
from .schema_validator import validate_playbook, validate_playbook_json
from .ai_playbooks import generate_playbook_from_prompt, explain_playbook_step
from .metrics import (
    playbook_drafts_total, playbook_publish_total, playbook_rollback_total,
    playbook_test_runs_total, playbook_ai_drafts_total
)
from .playbook_engine import execute_playbook
from .repo_enrichment import list_actions

logger = logging.getLogger("enrichment.playbooks")

router = APIRouter(prefix="/playbooks", tags=["playbook-studio"])


# Request/Response models
class CreatePlaybookRequest(BaseModel):
    name: str
    description: Optional[str] = None
    jsonBody: Dict[str, Any]
    status: Optional[str] = "draft"


class UpdatePlaybookRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    jsonBody: Optional[Dict[str, Any]] = None
    status: Optional[str] = None
    releaseNotes: Optional[str] = None


class ValidatePlaybookRequest(BaseModel):
    jsonBody: Dict[str, Any]


class ValidatePlaybookResponse(BaseModel):
    isValid: bool
    error: Optional[str] = None
    warnings: List[str] = []


class AIGenerateRequest(BaseModel):
    prompt: str


class TestRunRequest(BaseModel):
    jsonBody: Dict[str, Any]
    mockSubject: Optional[Dict[str, Any]] = None


class ExplainStepRequest(BaseModel):
    step: Dict[str, Any]


def get_user_id(request: Request) -> Optional[str]:
    """Extract user ID from request state (set by auth middleware)."""
    user = getattr(request.state, "user", None)
    if user:
        return user.get("sub") or user.get("email")
    return None


@router.post("", response_model=Dict[str, Any])
async def create_playbook_endpoint(
    request_data: CreatePlaybookRequest,
    request: Request
):
    """Create a new playbook."""
    user_id = get_user_id(request)
    
    # Validate playbook - allow empty steps for drafts
    # Default status is "draft" if not provided
    status = request_data.status or "draft"
    is_valid, error, warnings = validate_playbook(request_data.jsonBody, allow_empty_steps=(status == "draft"))
    if not is_valid:
        raise HTTPException(status_code=400, detail=error)
    
    # Generate ID
    playbook_id = f"pb-{uuid.uuid4().hex[:8]}"
    
    # Create playbook
    playbook = await create_playbook(
        playbook_id=playbook_id,
        name=request_data.name,
        description=request_data.description,
        json_body=request_data.jsonBody,
        status=request_data.status or "draft",
        created_by=user_id
    )
    
    playbook_drafts_total.labels(status=request_data.status or "draft").inc()
    
    return playbook


@router.get("", response_model=List[Dict[str, Any]])
async def list_playbooks_endpoint(
    status: Optional[str] = None,
    created_by: Optional[str] = None,
    include_drafts: bool = True
):
    """List all playbooks."""
    return await list_playbooks(status=status, created_by=created_by, include_drafts=include_drafts)


@router.get("/{playbook_id}", response_model=Dict[str, Any])
async def get_playbook_endpoint(playbook_id: str):
    """Get a single playbook."""
    playbook = await get_playbook(playbook_id)
    if not playbook:
        raise HTTPException(status_code=404, detail="Playbook not found")
    return playbook


@router.put("/{playbook_id}", response_model=Dict[str, Any])
async def update_playbook_endpoint(
    playbook_id: str,
    request_data: UpdatePlaybookRequest,
    request: Request
):
    """Update a playbook."""
    user_id = get_user_id(request)
    
    # Validate if jsonBody is provided
    if request_data.jsonBody:
        # Get current playbook status to determine if we should allow empty steps
        current_playbook = await get_playbook(playbook_id)
        current_status = current_playbook.get("status", "draft") if current_playbook else "draft"
        new_status = request_data.status or current_status
        allow_empty = (new_status == "draft")
        
        is_valid, error, warnings = validate_playbook(request_data.jsonBody, allow_empty_steps=allow_empty)
        if not is_valid:
            raise HTTPException(status_code=400, detail=error)
    
    # Handle status change to published
    if request_data.status == "published":
        playbook_publish_total.labels(user=user_id or "unknown").inc()
    
    playbook = await update_playbook(
        playbook_id=playbook_id,
        name=request_data.name,
        description=request_data.description,
        json_body=request_data.jsonBody,
        status=request_data.status,
        updated_by=user_id,
        release_notes=request_data.releaseNotes
    )
    
    if not playbook:
        raise HTTPException(status_code=404, detail="Playbook not found")
    
    return playbook


@router.delete("/{playbook_id}")
async def delete_playbook_endpoint(playbook_id: str):
    """Delete a playbook (soft delete)."""
    success = await delete_playbook(playbook_id)
    if not success:
        raise HTTPException(status_code=404, detail="Playbook not found")
    return {"success": True}


@router.get("/{playbook_id}/versions", response_model=List[Dict[str, Any]])
async def get_playbook_versions_endpoint(playbook_id: str):
    """Get all versions of a playbook."""
    versions = await get_playbook_versions(playbook_id)
    if not versions:
        # Check if playbook exists
        playbook = await get_playbook(playbook_id)
        if not playbook:
            raise HTTPException(status_code=404, detail="Playbook not found")
    return versions


@router.get("/{playbook_id}/versions/{version}", response_model=Dict[str, Any])
async def get_playbook_version_endpoint(playbook_id: str, version: int):
    """Get a specific version of a playbook."""
    version_data = await get_playbook_version(playbook_id, version)
    if not version_data:
        raise HTTPException(status_code=404, detail="Playbook version not found")
    return version_data


@router.post("/{playbook_id}/rollback/{version}", response_model=Dict[str, Any])
async def rollback_playbook_endpoint(
    playbook_id: str,
    version: int,
    request: Request
):
    """Rollback a playbook to a specific version."""
    user_id = get_user_id(request)
    
    playbook = await rollback_playbook(playbook_id, version, rolled_back_by=user_id)
    if not playbook:
        raise HTTPException(status_code=404, detail="Playbook or version not found")
    
    playbook_rollback_total.labels(user=user_id or "unknown").inc()
    
    return playbook


@router.post("/validate", response_model=ValidatePlaybookResponse)
async def validate_playbook_endpoint(request_data: ValidatePlaybookRequest):
    """Validate a playbook JSON structure."""
    # Allow empty steps for validation (assumes draft status)
    is_valid, error, warnings = validate_playbook(request_data.jsonBody, allow_empty_steps=True)
    return ValidatePlaybookResponse(
        isValid=is_valid,
        error=error,
        warnings=warnings
    )


@router.post("/ai/generate", response_model=Dict[str, Any])
async def ai_generate_playbook(request_data: AIGenerateRequest):
    """Generate a playbook from a natural language prompt."""
    try:
        # Get available actions for context
        available_actions = await list_actions()
        
        playbook_json = await generate_playbook_from_prompt(
            request_data.prompt,
            available_actions
        )
        
        playbook_ai_drafts_total.labels(result="success").inc()
        
        return {
            "playbook": playbook_json,
            "prompt": request_data.prompt
        }
    except Exception as e:
        logger.error(f"AI generation failed: {e}", exc_info=True)
        playbook_ai_drafts_total.labels(result="failed").inc()
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}")


@router.post("/ai/explain", response_model=Dict[str, str])
async def ai_explain_step(request_data: ExplainStepRequest):
    """Explain a playbook step in natural language."""
    try:
        available_actions = await list_actions()
        explanation = await explain_playbook_step(request_data.step, available_actions)
        return {"explanation": explanation}
    except Exception as e:
        logger.error(f"AI explanation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"AI explanation failed: {str(e)}")


@router.post("/test-run", response_model=Dict[str, Any])
async def test_run_playbook(request_data: TestRunRequest):
    """Test run a playbook with mock data (sandbox mode)."""
    # Validate playbook - require at least one step for test runs
    is_valid, error, warnings = validate_playbook(request_data.jsonBody, allow_empty_steps=False)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error)
    
    # Use mock subject if provided, otherwise use default
    mock_subject = request_data.mockSubject or {
        "id": "test-alert-1",
        "message": "Test alert with IP 8.8.8.8 and domain example.com",
        "attrs": {
            "ip": "8.8.8.8",
            "domain": "example.com"
        }
    }
    
    try:
        # Get actions for execution
        actions = await list_actions()
        action_registry = {a["id"]: a for a in actions}
        
        # Execute playbook in test mode (no external calls)
        steps = request_data.jsonBody.get("steps", [])
        
        # For test run, we'll execute but mark as test mode
        # In a real implementation, you'd stub external HTTP calls
        context = {
            "subject": mock_subject,
            "run": {
                "steps": [],
                "output": {}
            }
        }
        
        results = []
        for step in steps:
            # Execute step but in test mode (no external calls)
            # For now, we'll just validate and return mock results
            step_result = {
                "stepId": step.get("stepId", step.get("kind")),
                "kind": step.get("kind"),
                "status": "success",
                "output": {"test_mode": True, "message": "Test run - no external calls made"},
                "error": None
            }
            results.append(step_result)
        
        playbook_test_runs_total.labels(result="success").inc()
        
        return {
            "status": "success",
            "steps": results,
            "subject": mock_subject,
            "testMode": True
        }
    except Exception as e:
        logger.error(f"Test run failed: {e}", exc_info=True)
        playbook_test_runs_total.labels(result="failed").inc()
        raise HTTPException(status_code=500, detail=f"Test run failed: {str(e)}")

