import os
import httpx
from fastapi import APIRouter, Response
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST

router = APIRouter()


async def check_ontology() -> dict:
    """Check Ontology service."""
    ontology_url = os.getenv("ONTOLOGY_BASE_URL", "http://ontology:8081")
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(f"{ontology_url}/health")
            if r.status_code == 200:
                return {"status": "ok"}
            return {"status": "down", "error": f"HTTP {r.status_code}"}
    except Exception as e:
        return {"status": "down", "error": str(e)}


@router.get("/health")
async def health():
    """Liveness check."""
    return {"status": "ok"}


@router.get("/health/ready")
async def health_ready():
    """Readiness check with dependency verification."""
    checks = {
        "ontology": await check_ontology(),
    }

    all_ok = all(c["status"] == "ok" for c in checks.values())
    status = "ok" if all_ok else "down"

    return {"status": status, "checks": checks}


@router.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint."""
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
