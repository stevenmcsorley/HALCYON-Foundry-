from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from .er import resolve_entities

router = APIRouter(prefix="/federation", tags=["federation"])


class ResolveRequest(BaseModel):
    candidates: List[Dict[str, Any]]
    use_similarity: bool = True


class ResolveResponse(BaseModel):
    resolved: List[Dict[str, Any]]
    count: int


@router.post("/resolve", response_model=ResolveResponse)
async def resolve_entity_candidates(request: ResolveRequest):
    """
    Resolve duplicate entities from candidate list.
    
    Uses deterministic keys (externalId, ip, email) and similarity matching.
    """
    try:
        resolved = resolve_entities(request.candidates, use_similarity=request.use_similarity)
        return ResolveResponse(resolved=resolved, count=len(resolved))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
