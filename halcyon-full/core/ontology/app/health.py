from fastapi import APIRouter, Depends, Response
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
from .state import meta, graph

router = APIRouter()


async def check_postgres() -> dict:
    """Check Postgres connectivity."""
    try:
        if meta._pool is None:
            return {"status": "down", "error": "pool not initialized"}
        async with meta._pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return {"status": "ok"}
    except Exception as e:
        return {"status": "down", "error": str(e)}


async def check_neo4j() -> dict:
    """Check Neo4j connectivity."""
    try:
        await graph._driver.verify_connectivity()
        return {"status": "ok"}
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
        "postgres": await check_postgres(),
        "neo4j": await check_neo4j(),
    }

    all_ok = all(c["status"] == "ok" for c in checks.values())
    degraded = any(c["status"] == "down" for c in checks.values()) and not all_ok

    status = "ok" if all_ok else ("degraded" if degraded else "down")

    return {"status": status, "checks": checks}


@router.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint."""
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
