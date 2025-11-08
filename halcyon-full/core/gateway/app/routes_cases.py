"""REST routes for Cases & Ownership."""
from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Optional, List
from .db import get_pool
from .models_cases import CaseCreate, CaseUpdate, Case, CaseNoteCreate, CaseNote, AssignAlertsRequest
from .repo_cases import (
    create_case, update_case, get_case, list_cases,
    add_case_note, list_case_notes, assign_alerts_to_case
)
from .resolvers_cases import apply_ml_suggestions
from .metrics import ml_suggestion_applied_total
from .ws_pubsub import hub
from .config import settings
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cases", tags=["cases"])


def get_user(request: Request) -> dict:
    """Extract user info from request state."""
    user = getattr(request.state, "user", None)
    if not user:
        return {"sub": "anonymous", "roles": settings.default_roles}
    if isinstance(user, dict):
        return user
    return {"sub": getattr(user, "sub", "anonymous"), "roles": getattr(user, "roles", settings.default_roles)}


def require_roles(allowed_roles: List[str]):
    """Dependency to check if user has required role."""
    async def _check(request: Request):
        user = get_user(request)
        roles = user.get("roles", [])
        if not any(r in allowed_roles for r in roles):
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return _check


@router.get("", response_model=List[Case], response_model_by_alias=True)
async def get_cases_list(
    status: Optional[str] = None,
    owner: Optional[str] = None,
    priority: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    user=Depends(get_user),  # viewer+ can list
):
    """List cases with filters."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        cases = await list_cases(conn, status, owner, priority, search, limit, offset)
        return [Case(**c) for c in cases]


@router.post("", response_model=Case, status_code=201, response_model_by_alias=True)
async def post_case(
    payload: CaseCreate,
    user=Depends(require_roles(["analyst", "admin"])),
):
    """Create a new case (analyst/admin only)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        case = await create_case(conn, payload, user.get("sub"))
        from .metrics import cases_created_total
        cases_created_total.labels(priority=case["priority"]).inc()
        
        # Apply ML suggestions
        await apply_ml_suggestions(conn, case)
        
        # Fetch updated case with ML suggestions
        case = await get_case(conn, case["id"])
        
        logger.info("case_created", extra={"case_id": case["id"], "created_by": user.get("sub")})
        return Case(**case)


@router.get("/{case_id}", response_model=Case, response_model_by_alias=True)
async def get_case_detail(case_id: int, user=Depends(get_user)):
    """Get a case by ID (viewer+ can read)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        case = await get_case(conn, case_id)
        if not case:
            raise HTTPException(status_code=404, detail="Case not found")
        return Case(**case)


@router.patch("/{case_id}", response_model=Case, response_model_by_alias=True)
async def patch_case(
    case_id: int,
    payload: CaseUpdate,
    user=Depends(require_roles(["analyst", "admin"])),
):
    """Update a case (analyst/admin only)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        case = await update_case(conn, case_id, payload)
        if not case:
            raise HTTPException(status_code=404, detail="Case not found")
        
        # Recompute ML suggestions if title, priority, or status changed
        if payload.title or payload.priority or payload.status:
            await apply_ml_suggestions(conn, case)
            # Fetch updated case with ML suggestions
            case = await get_case(conn, case_id)
        
        # Increment resolved metric if status changed to resolved|closed
        if payload.status and payload.status in ("resolved", "closed"):
            from .metrics import cases_resolved_total
            cases_resolved_total.inc()
        
        logger.info("case_updated", extra={"case_id": case_id, "updated_by": user.get("sub")})
        return Case(**case)


@router.get("/{case_id}/notes", response_model=List[CaseNote])
async def get_case_notes(case_id: int, user=Depends(get_user)):
    """List notes for a case (viewer+ can read)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Verify case exists
        case = await get_case(conn, case_id)
        if not case:
            raise HTTPException(status_code=404, detail="Case not found")
        notes = await list_case_notes(conn, case_id)
        return [CaseNote(**n) for n in notes]


@router.post("/{case_id}/notes", response_model=CaseNote, status_code=201)
async def post_case_note(
    case_id: int,
    payload: CaseNoteCreate,
    user=Depends(require_roles(["analyst", "admin"])),
):
    """Add a note to a case (analyst/admin only)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Verify case exists
        case = await get_case(conn, case_id)
        if not case:
            raise HTTPException(status_code=404, detail="Case not found")
        note = await add_case_note(conn, case_id, payload, user.get("sub"))
        logger.info("case_note_added", extra={"case_id": case_id, "note_id": note["id"], "author": user.get("sub")})
        return CaseNote(**note)


@router.post("/{case_id}/alerts:assign", response_model=dict)
async def post_assign_alerts(
    case_id: int,
    payload: AssignAlertsRequest,
    user=Depends(require_roles(["analyst", "admin"])),
):
    """Assign alerts to a case (analyst/admin only)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Verify case exists
        case = await get_case(conn, case_id)
        if not case:
            raise HTTPException(status_code=404, detail="Case not found")
        
        count = await assign_alerts_to_case(conn, case_id, payload.alert_ids)
        
        # Emit WebSocket updates for assigned alerts
        from .repo_alerts import get_alert
        for alert_id in payload.alert_ids:
            alert = await get_alert(alert_id)
            if alert:
                await hub.publish({
                    "t": "alert.updated",
                    "data": {
                        "id": alert_id,
                        "case_id": case_id,
                        **alert,
                    },
                })
        
        from .metrics import alerts_assigned_to_case_total
        alerts_assigned_to_case_total.inc(count)
        logger.info("alerts_assigned_to_case", extra={
            "case_id": case_id,
            "alert_count": count,
            "assigned_by": user.get("sub"),
        })
        return {"ok": True, "assigned_count": count}


@router.patch("/{case_id}/adopt/priority", response_model=Case, response_model_by_alias=True)
async def adopt_priority_suggestion(
    case_id: int,
    user=Depends(require_roles(["analyst", "admin"])),
):
    """Adopt ML-suggested priority for a case (analyst/admin only)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        case = await get_case(conn, case_id)
        if not case:
            raise HTTPException(status_code=404, detail="Case not found")
        
        if not case.get("priority_suggestion"):
            raise HTTPException(status_code=400, detail="No priority suggestion available")
        
        # Update case with suggested priority
        updated = await update_case(conn, case_id, CaseUpdate(priority=case["priority_suggestion"]))
        if not updated:
            raise HTTPException(status_code=404, detail="Case not found")
        
        ml_suggestion_applied_total.labels(type="priority").inc()
        logger.info("ml_suggestion_adopted", extra={
            "case_id": case_id,
            "type": "priority",
            "value": case["priority_suggestion"],
            "adopted_by": user.get("sub"),
        })
        
        # Fetch updated case
        case = await get_case(conn, case_id)
        return Case(**case)


@router.patch("/{case_id}/adopt/owner", response_model=Case, response_model_by_alias=True)
async def adopt_owner_suggestion(
    case_id: int,
    user=Depends(require_roles(["analyst", "admin"])),
):
    """Adopt ML-suggested owner for a case (analyst/admin only)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        case = await get_case(conn, case_id)
        if not case:
            raise HTTPException(status_code=404, detail="Case not found")
        
        if not case.get("owner_suggestion"):
            raise HTTPException(status_code=400, detail="No owner suggestion available")
        
        # Update case with suggested owner
        updated = await update_case(conn, case_id, CaseUpdate(owner=case["owner_suggestion"]))
        if not updated:
            raise HTTPException(status_code=404, detail="Case not found")
        
        ml_suggestion_applied_total.labels(type="owner").inc()
        logger.info("ml_suggestion_adopted", extra={
            "case_id": case_id,
            "type": "owner",
            "value": case["owner_suggestion"],
            "adopted_by": user.get("sub"),
        })
        
        # Fetch updated case
        case = await get_case(conn, case_id)
        return Case(**case)
