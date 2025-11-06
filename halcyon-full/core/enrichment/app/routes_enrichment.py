"""API routes for enrichment actions and playbooks."""
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime
import uuid
import hashlib
import os
import re
import logging
from .repo_enrichment import (
    list_actions, get_action, list_playbooks, get_playbook,
    create_enrichment_run, update_enrichment_run,
    create_playbook_run, update_playbook_run, list_runs
)
from .enrichment_engine import execute_action
from .playbook_engine import execute_playbook

logger = logging.getLogger("enrichment.routes")


def _extract_attrs_from_case(case_data: Dict[str, Any]) -> Dict[str, Any]:
    """Extract IPs, domains, and other attributes from case data."""
    attrs = {}
    text = f"{case_data.get('title', '')} {case_data.get('description', '')}"
    
    # Extract IP addresses
    ip_pattern = r'\b(?:\d{1,3}\.){3}\d{1,3}\b'
    ips = re.findall(ip_pattern, text)
    if ips:
        attrs["ip"] = ips[0]
        attrs["source"] = ips[0]
    
    # Extract domains
    domain_pattern = r'\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}\b'
    domains = re.findall(domain_pattern, text)
    if domains:
        attrs["domain"] = domains[0]
        attrs["hostname"] = domains[0]
    
    # Extract hash-like strings
    hash_pattern = r'\b[a-fA-F0-9]{32,64}\b'
    hashes = re.findall(hash_pattern, text)
    if hashes:
        attrs["hash"] = hashes[0]
        if len(hashes[0]) == 32:
            attrs["md5"] = hashes[0]
        elif len(hashes[0]) == 64:
            attrs["sha256"] = hashes[0]
    
    return attrs


def _extract_attrs_from_alert(alert_data: Dict[str, Any]) -> Dict[str, Any]:
    """Extract IPs, domains, and other attributes from alert data."""
    attrs = {}
    
    # Combine all text fields for extraction
    # Alert model uses snake_case: entity_id, not entityId
    message = str(alert_data.get('message', '') or alert_data.get('msg', '') or '')
    entity_id = str(alert_data.get('entityId', '') or alert_data.get('entity_id', '') or '')
    fingerprint = str(alert_data.get('fingerprint', '') or '')
    text = f"{message} {entity_id} {fingerprint}"
    
    # Debug logging
    logger.info(f"Extracting attrs from alert: message='{message[:100]}', entity_id='{entity_id}', fingerprint='{fingerprint[:50]}', full_text='{text[:200]}'")
    
    # Extract IP addresses - also check entity_id format like "ip-8.8.8.8"
    ip_pattern = r'\b(?:\d{1,3}\.){3}\d{1,3}\b'
    ips = re.findall(ip_pattern, text)
    if ips:
        attrs["ip"] = ips[0]
        attrs["source"] = ips[0]
        attrs["ip_address"] = ips[0]
        logger.info(f"Extracted IP: {ips[0]}")
    
    # Extract domains
    domain_pattern = r'\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}\b'
    domains = re.findall(domain_pattern, text)
    if domains:
        # Filter out common non-domain patterns
        filtered_domains = [d for d in domains if not d.startswith('http://') and not d.startswith('https://')]
        if filtered_domains:
            attrs["domain"] = filtered_domains[0]
            attrs["hostname"] = filtered_domains[0]
            logger.info(f"Extracted domain: {filtered_domains[0]}")
    
    # Extract hash-like strings
    hash_pattern = r'\b[a-fA-F0-9]{32,64}\b'
    hashes = re.findall(hash_pattern, text)
    if hashes:
        attrs["hash"] = hashes[0]
        if len(hashes[0]) == 32:
            attrs["md5"] = hashes[0]
        elif len(hashes[0]) == 64:
            attrs["sha256"] = hashes[0]
        logger.info(f"Extracted hash: {hashes[0]}")
    
    logger.info(f"Final extracted attrs: {attrs}")
    return attrs

router = APIRouter(prefix="/enrich", tags=["enrichment"])


# Request/Response models
class RunActionRequest(BaseModel):
    subjectKind: str  # "alert" | "case"
    subjectId: str
    actionId: str
    attachAsNote: Optional[bool] = False


class RunPlaybookRequest(BaseModel):
    subjectKind: str
    subjectId: str
    playbookId: str
    attachAsNote: Optional[bool] = False


class RunResponse(BaseModel):
    id: str
    subjectKind: str
    subjectId: str
    kind: str  # "action" | "playbook"
    ref: Dict[str, Any]
    status: str
    startedAt: str
    finishedAt: Optional[str]
    output: Optional[Dict[str, Any]]
    error: Optional[str]
    metrics: Dict[str, Any]
    steps: Optional[List[Dict[str, Any]]] = None  # Playbook steps at top level


def get_user(request: Request) -> dict:
    """Extract user info from request state."""
    user = getattr(request.state, "user", None)
    if not user:
        return {"sub": "anonymous", "roles": []}
    if isinstance(user, dict):
        return user
    return {"sub": getattr(user, "sub", "anonymous"), "roles": getattr(user, "roles", [])}


def require_roles(allowed_roles: List[str]):
    """Dependency to check if user has required role."""
    async def _check(request: Request):
        user = get_user(request)
        roles = user.get("roles", [])
        if not any(r in allowed_roles for r in roles):
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return _check


@router.get("/actions")
async def get_actions(user=Depends(get_user)):
    """List available enrichment actions (viewer+)."""
    actions = await list_actions()
    return [
        {
            "id": a["id"],
            "name": a["name"],
            "kind": a["kind"],
            "config": a["config"],
            "enabled": a["enabled"]
        }
        for a in actions
    ]


@router.post("/run")
async def run_action(
    request: Request,
    payload: RunActionRequest,
    user=Depends(require_roles(["analyst", "admin"]))
):
    """Run an enrichment action (analyst|admin)."""
    # Get action
    action = await get_action(payload.actionId)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    
    # Fetch subject from Gateway API
    import httpx
    gateway_url = os.getenv("GATEWAY_URL", "http://gateway:8088")
    subject = {
        "id": payload.subjectId,
        "type": payload.subjectKind.title(),
        "attrs": {}
    }
    
    try:
        # Fetch actual case/alert data from Gateway
        auth_header = request.headers.get("Authorization", "")
        headers = {"Authorization": auth_header} if auth_header else {}
        
        if payload.subjectKind == "case":
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    f"{gateway_url}/cases/{payload.subjectId}",
                    headers=headers
                )
                if resp.status_code == 200:
                    case_data = resp.json()
                    # Extract IPs/domains from case title/description
                    subject["attrs"] = _extract_attrs_from_case(case_data)
        elif payload.subjectKind == "alert":
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    f"{gateway_url}/alerts/{payload.subjectId}",
                    headers=headers
                )
                if resp.status_code == 200:
                    alert_data = resp.json()
                    # Extract IPs/domains from alert data
                    subject["attrs"] = _extract_attrs_from_alert(alert_data)
    except Exception as e:
        logger.warning(f"Failed to fetch subject from Gateway: {e}, using empty attrs")
        # Continue with empty attrs - enrichment actions should handle gracefully
    
    # Create run record
    run_id = f"run_{uuid.uuid4().hex[:12]}"
    started_at = datetime.utcnow()
    await create_enrichment_run(
        run_id, payload.subjectKind, payload.subjectId, payload.actionId,
        "running", started_at, user.get("sub")
    )
    
    try:
        # Execute action
        output = await execute_action(
            payload.actionId,
            action["kind"],
            action["config"],
            subject
        )
        
        finished_at = datetime.utcnow()
        duration_ms = int((finished_at - started_at).total_seconds() * 1000)
        
        await update_enrichment_run(
            run_id, "success", finished_at, output,
            metrics={"latencyMs": duration_ms}
        )
        
        return RunResponse(
            id=run_id,
            subjectKind=payload.subjectKind,
            subjectId=payload.subjectId,
            kind="action",
            ref={"actionId": payload.actionId},
            status="success",
            startedAt=started_at.isoformat() + "Z",
            finishedAt=finished_at.isoformat() + "Z",
            output=output,
            error=None,
            metrics={"latencyMs": duration_ms}
        )
    
    except Exception as e:
        finished_at = datetime.utcnow()
        error_msg = str(e)
        logger.error(f"Action run {run_id} failed: {error_msg}", exc_info=True)
        
        await update_enrichment_run(
            run_id, "failed", finished_at, error=error_msg
        )
        
        # Return error response instead of raising exception
        return RunResponse(
            id=run_id,
            subjectKind=payload.subjectKind,
            subjectId=payload.subjectId,
            kind="action",
            ref={"actionId": payload.actionId},
            status="failed",
            startedAt=started_at.isoformat() + "Z",
            finishedAt=finished_at.isoformat() + "Z",
            output=None,
            error=error_msg,
            metrics={}
        )


@router.get("/runs")
async def get_runs(
    subjectKind: str,
    subjectId: str,
    user=Depends(get_user)
):
    """Get enrichment runs for a subject (viewer+)."""
    runs = await list_runs(subjectKind, subjectId)
    return runs


@router.get("/playbooks")
async def get_playbooks_endpoint(user=Depends(get_user)):
    """List available playbooks (viewer+)."""
    playbooks = await list_playbooks()
    return [
        {
            "id": p["id"],
            "name": p["name"],
            "version": p["version"],
            "enabled": p["enabled"]
        }
        for p in playbooks
    ]


@router.post("/playbooks/run")
async def run_playbook_endpoint(
    request: Request,
    payload: RunPlaybookRequest,
    user=Depends(require_roles(["analyst", "admin"]))
):
    """Run a playbook (analyst|admin)."""
    # Get playbook
    playbook = await get_playbook(payload.playbookId)
    if not playbook:
        raise HTTPException(status_code=404, detail="Playbook not found")
    
    # Debug: Log playbook structure
    logger.info(f"Playbook {payload.playbookId} loaded: keys={list(playbook.keys())}, steps={playbook.get('steps')}, steps_json={playbook.get('steps_json')}")
    
    # Get all actions for playbook
    actions = await list_actions()
    action_registry = {a["id"]: a for a in actions}
    logger.info(f"Action registry: {list(action_registry.keys())}")
    
    # Fetch subject from Gateway API
    import httpx
    gateway_url = os.getenv("GATEWAY_URL", "http://gateway:8088")
    subject = {
        "id": payload.subjectId,
        "type": payload.subjectKind.title(),
        "attrs": {}
    }
    
    try:
        # Fetch actual case/alert data from Gateway
        # Get auth header from request if available
        auth_header = ""
        try:
            if hasattr(request, 'headers'):
                auth_header = request.headers.get("Authorization", "")
        except:
            pass
        
        headers = {}
        if auth_header:
            headers["Authorization"] = auth_header
        
        if payload.subjectKind == "case":
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    f"{gateway_url}/cases/{payload.subjectId}",
                    headers=headers
                )
                logger.info(f"Fetched case {payload.subjectId}: status={resp.status_code}")
                if resp.status_code == 200:
                    case_data = resp.json()
                    subject["attrs"] = _extract_attrs_from_case(case_data)
                    logger.info(f"Extracted attrs from case: {subject['attrs']}")
        elif payload.subjectKind == "alert":
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    f"{gateway_url}/alerts/{payload.subjectId}",
                    headers=headers
                )
                logger.info(f"Fetched alert {payload.subjectId}: status={resp.status_code}")
                if resp.status_code == 200:
                    alert_data = resp.json()
                    subject["attrs"] = _extract_attrs_from_alert(alert_data)
                    logger.info(f"Extracted attrs from alert: {subject['attrs']}")
                elif resp.status_code == 404:
                    logger.error(f"Alert {payload.subjectId} not found - check if alert exists")
                elif resp.status_code == 401:
                    logger.warning(f"Unauthorized to fetch alert {payload.subjectId} - trying without auth")
                    # Try without auth header
                    async with httpx.AsyncClient(timeout=5.0) as client:
                        resp2 = await client.get(f"{gateway_url}/alerts/{payload.subjectId}")
                        if resp2.status_code == 200:
                            alert_data = resp2.json()
                            subject["attrs"] = _extract_attrs_from_alert(alert_data)
                            logger.info(f"Extracted attrs from alert (no auth): {subject['attrs']}")
    except Exception as e:
        logger.error(f"Failed to fetch subject from Gateway: {e}", exc_info=True)
        # Continue with empty attrs - enrichment actions should handle gracefully
    
    # Create run record
    run_id = f"pb_run_{uuid.uuid4().hex[:12]}"
    started_at = datetime.utcnow()
    await create_playbook_run(
        run_id, payload.subjectKind, payload.subjectId, payload.playbookId,
        "running", started_at, [], user.get("sub")
    )
    
    try:
        # Debug: Log before execution
        logger.info(f"About to execute playbook {payload.playbookId}: steps_count={len(playbook.get('steps', []))}")
        
        # Execute playbook
        result = await execute_playbook(playbook, subject, action_registry)
        
        # Debug: Log result
        logger.info(f"Playbook execution complete: status={result.get('status')}, steps_executed={len(result.get('steps', []))}, output_steps={len(result.get('output', {}).get('steps', []))}")
        
        finished_at = datetime.utcnow()
        
        await update_playbook_run(
            run_id, result["status"], finished_at,
            result["steps"], result["output"],
            metrics={"durationMs": result["durationMs"]}
        )
        
        return RunResponse(
            id=run_id,
            subjectKind=payload.subjectKind,
            subjectId=payload.subjectId,
            kind="playbook",
            ref={"playbookId": payload.playbookId},
            status=result["status"],
            startedAt=result["startedAt"],
            finishedAt=result["finishedAt"],
            output=result["output"],
            error=None,
            metrics={"durationMs": result["durationMs"]},
            steps=result.get("steps", [])  # Include steps at top level for UI
        )
    
    except Exception as e:
        finished_at = datetime.utcnow()
        error_msg = str(e)
        logger.error(f"Playbook run {run_id} failed: {error_msg}", exc_info=True)
        
        await update_playbook_run(
            run_id, "failed", finished_at,
            [], {"steps": [], "summary": {"total": 0, "success": 0, "failed": 0}, "error": error_msg},
            error=error_msg
        )
        
        # Return error response instead of raising
        return RunResponse(
            id=run_id,
            subjectKind=payload.subjectKind,
            subjectId=payload.subjectId,
            kind="playbook",
            ref={"playbookId": payload.playbookId},
            status="failed",
            startedAt=started_at.isoformat() + "Z",
            finishedAt=finished_at.isoformat() + "Z",
            output={"steps": [], "summary": {"total": 0, "success": 0, "failed": 0}},
            error=error_msg,
            metrics={}
        )


@router.get("/playbooks/runs")
async def get_playbook_runs(
    subjectKind: str,
    subjectId: str,
    user=Depends(get_user)
):
    """Get playbook runs for a subject (viewer+)."""
    runs = await list_runs(subjectKind, subjectId)
    # Filter to only playbook runs
    return [r for r in runs if r["kind"] == "playbook"]

