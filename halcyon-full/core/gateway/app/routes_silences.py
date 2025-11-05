"""REST API routes for alert silences."""
from fastapi import APIRouter, Depends, HTTPException, Request
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
from .repo_suppress import list_silences, create_silence, delete_silence
from .config import settings

router = APIRouter(prefix="/silences", tags=["silences"])


class SilenceIn(BaseModel):
    name: str
    match_json: dict
    starts_at: str  # ISO format timestamp
    ends_at: str  # ISO format timestamp
    reason: Optional[str] = None


class Silence(BaseModel):
    id: int
    name: str
    match_json: dict
    starts_at: str
    ends_at: str
    reason: Optional[str] = None
    created_by: Optional[str] = None
    created_at: str


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


@router.get("", response_model=List[Silence])
async def get_silences(
    include_expired: bool = False,
    user: dict = Depends(require_roles(["viewer", "analyst", "admin"]))
):
    """List all silences (optionally including expired ones)."""
    try:
        silences = await list_silences(include_expired=include_expired)
        return silences
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", response_model=dict, status_code=201)
async def create_silence_route(
    silence: SilenceIn,
    user: dict = Depends(require_roles(["analyst", "admin"]))
):
    """Create a new silence."""
    try:
        # Parse timestamps
        starts_at = datetime.fromisoformat(silence.starts_at.replace("Z", "+00:00"))
        ends_at = datetime.fromisoformat(silence.ends_at.replace("Z", "+00:00"))

        # Validate time range
        if starts_at >= ends_at:
            raise HTTPException(status_code=400, detail="starts_at must be before ends_at")

        # Validate match_json is an object
        if not isinstance(silence.match_json, dict):
            raise HTTPException(status_code=400, detail="match_json must be an object")

        created_by = user.get("sub") or user.get("username")
        silence_id = await create_silence(
            name=silence.name,
            match_json=silence.match_json,
            starts_at=starts_at,
            ends_at=ends_at,
            reason=silence.reason,
            created_by=created_by
        )
        return {"id": silence_id, "message": "Silence created"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid timestamp format: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{silence_id}", response_model=dict)
async def delete_silence_route(
    silence_id: int,
    user: dict = Depends(require_roles(["analyst", "admin"]))
):
    """Delete a silence by ID."""
    try:
        deleted = await delete_silence(silence_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Silence not found")
        return {"message": "Silence deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
