"""REST API routes for ML feedback."""
from fastapi import APIRouter, Request, HTTPException, Depends
from typing import Optional, List
from pydantic import BaseModel
from .db import get_pool
from .ml_feedback import record_feedback, get_feedback_stats
from .repo_feedback import get_feedback_by_case as repo_get_feedback
from .config import settings
import os

router = APIRouter(prefix="/ml", tags=["ml"])

ML_ENABLE_FEEDBACK = os.getenv("ML_ENABLE_FEEDBACK", "true").lower() == "true"


class FeedbackRequest(BaseModel):
    suggestionType: str  # "priority" or "owner"
    suggestedValue: str
    finalValue: Optional[str] = None
    action: str  # "accepted", "rejected", "overridden"
    score: Optional[float] = None


class FeedbackResponse(BaseModel):
    id: int
    caseId: int
    suggestionType: str
    suggestedValue: str
    finalValue: Optional[str]
    action: str
    score: Optional[float]
    userId: Optional[str]
    createdAt: str


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


@router.get("/cases/{case_id}/feedback", response_model=list[FeedbackResponse])
async def get_feedback_for_case(case_id: int, user=Depends(get_user)):
    """Get feedback events for a case (viewer+)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        feedback = await repo_get_feedback(conn, case_id)
        return [
            FeedbackResponse(
                id=f["id"],
                caseId=f["case_id"],
                suggestionType=f["suggestion_type"],
                suggestedValue=f["suggested_value"],
                finalValue=f["final_value"],
                action=f["action"],
                score=f["score"],
                userId=f["user_id"],
                createdAt=f["created_at"] if isinstance(f["created_at"], str) else (f["created_at"].isoformat() if f["created_at"] else "")
            )
            for f in feedback
        ]


@router.post("/cases/{case_id}/feedback", response_model=FeedbackResponse, status_code=201)
async def provide_feedback(
    case_id: int,
    payload: FeedbackRequest,
    user=Depends(require_roles(["analyst", "admin"])),
):
    """
    Record feedback on a case suggestion (analyst|admin).
    
    Requires ML_ENABLE_FEEDBACK=true (env var).
    """
    if not ML_ENABLE_FEEDBACK:
        raise HTTPException(status_code=503, detail="ML feedback is disabled")
    
    user_id = user.get("sub")
    
    # Validate action
    if payload.action not in ["accepted", "rejected", "overridden"]:
        raise HTTPException(status_code=400, detail="Invalid action")
    
    # Validate suggestion type
    if payload.suggestionType not in ["priority", "owner"]:
        raise HTTPException(status_code=400, detail="Invalid suggestionType")
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        feedback = await record_feedback(
            case_id,
            payload.suggestionType,
            payload.suggestedValue,
            payload.finalValue,
            payload.action,
            payload.score,
            user_id,
            conn
        )
        
        return FeedbackResponse(
            id=feedback["id"],
            caseId=feedback["case_id"],
            suggestionType=feedback["suggestion_type"],
            suggestedValue=feedback["suggested_value"],
            finalValue=feedback["final_value"],
            action=feedback["action"],
            score=feedback["score"],
            userId=feedback["user_id"],
            createdAt=feedback["created_at"].isoformat() if feedback["created_at"] else ""
        )


@router.get("/stats")
async def get_stats(window: str = "7d", user=Depends(get_user)):
    """
    Get aggregate feedback statistics (viewer+).
    
    Args:
        window: Time window, e.g., "7d", "30d" (default: 7d)
    """
    # Parse window (simple implementation)
    window_days = 7
    if window.endswith("d"):
        try:
            window_days = int(window[:-1])
        except ValueError:
            pass
    
    stats = await get_feedback_stats(window_days)
    return stats

