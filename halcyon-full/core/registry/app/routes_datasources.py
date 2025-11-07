from __future__ import annotations

from typing import Any, Dict, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from .datasource_manager import manager as datasource_manager


router = APIRouter(prefix="/internal/datasources", tags=["datasource-internal"])


class TestRequest(BaseModel):
    payload: Dict[str, Any] = {}
    version: Optional[int] = None
    configOverride: Optional[Dict[str, Any]] = None


@router.post("/{datasource_id}/start", response_model=Dict[str, Any])
async def start_datasource(datasource_id: UUID):
    try:
        info = await datasource_manager.start_datasource(datasource_id)
        return {"status": "running", "datasource": str(datasource_id), "version": info.get("published_version")}
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Datasource not found")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/{datasource_id}/stop", response_model=Dict[str, Any])
async def stop_datasource(datasource_id: UUID):
    stopped = await datasource_manager.stop_datasource(datasource_id)
    if not stopped:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Datasource not running")
    return {"status": "stopped", "datasource": str(datasource_id)}


@router.post("/{datasource_id}/restart", response_model=Dict[str, Any])
async def restart_datasource(datasource_id: UUID):
    try:
        info = await datasource_manager.restart_datasource(datasource_id)
        return {"status": "running", "datasource": str(datasource_id), "version": info.get("published_version")}
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Datasource not found")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/{datasource_id}/reload", response_model=Dict[str, Any])
async def reload_datasource(datasource_id: UUID):
    try:
        info = await datasource_manager.reload_datasource(datasource_id)
        return {"status": info.get("status"), "datasource": str(datasource_id), "version": info.get("published_version")}
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Datasource not found")


@router.post("/{datasource_id}/backfill", response_model=Dict[str, Any])
async def backfill_datasource(datasource_id: UUID):
    # Placeholder for future implementation
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Backfill not implemented yet")


@router.post("/{datasource_id}/test", response_model=Dict[str, Any])
async def test_datasource(datasource_id: UUID, request: TestRequest):
    try:
        result = await datasource_manager.test_datasource(
            datasource_id,
            payload=request.payload,
            version=request.version,
            config_override=request.configOverride,
        )
        return result
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Datasource not found")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("/{datasource_id}/state", response_model=Dict[str, Any])
async def datasource_state(datasource_id: UUID):
    try:
        state = await datasource_manager.get_state(datasource_id)
        return state
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Datasource not found")

