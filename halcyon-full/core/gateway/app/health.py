import httpx
from fastapi import APIRouter, Response, Request, HTTPException
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
from .config import settings

router = APIRouter()


async def check_ontology() -> dict:
    """Check Ontology service."""
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(f"{settings.ontology_base_url}/health")
            if r.status_code == 200:
                return {"status": "ok"}
            return {"status": "down", "error": f"HTTP {r.status_code}"}
    except Exception as e:
        return {"status": "down", "error": str(e)}


async def check_opa() -> dict:
    """Check OPA service."""
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            # Check OPA health endpoint if available, or try a simple query
            r = await client.get(settings.policy_base_url.replace("/v1/data/halcyon/allow", "/health"))
            if r.status_code in (200, 404):  # 404 is ok, means OPA is up
                return {"status": "ok"}
            return {"status": "down", "error": f"HTTP {r.status_code}"}
    except Exception as e:
        return {"status": "down", "error": str(e)}


async def check_redis() -> dict:
    """Check Redis connectivity (via ws_pubsub if available)."""
    try:
        from .ws_pubsub import hub
        if hub.r is None:
            return {"status": "degraded", "error": "not initialized"}
        await hub.r.ping()
        return {"status": "ok"}
    except Exception as e:
        return {"status": "degraded", "error": str(e)}


@router.get("/health")
async def health():
    """Liveness check."""
    return {"status": "ok"}


@router.get("/health/ready")
async def health_ready():
    """Readiness check with dependency verification."""
    checks = {
        "ontology": await check_ontology(),
        "opa": await check_opa(),
        "redis": await check_redis(),
    }

    all_ok = all(c["status"] == "ok" for c in checks.values())
    degraded = any(c["status"] == "degraded" for c in checks.values()) or (
        not all_ok and any(c["status"] == "ok" for c in checks.values())
    )

    status = "ok" if all_ok else ("degraded" if degraded else "down")

    return {"status": status, "checks": checks}


@router.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint."""
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


@router.get("/auth/user")
async def get_current_user(request: Request):
    """Get current authenticated user information."""
    # Check if user was set by middleware (which runs even for /auth/user, but we need to check)
    user = getattr(request.state, "user", None)
    if not user:
        # If no user in state, try to extract from Authorization header directly
        from .auth import verify_token, extract_roles
        from .config import settings
        
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1]
            try:
                payload = await verify_token(token)
                if payload:
                    roles = extract_roles(payload)
                    user = {
                        "sub": payload.get("sub"),
                        "email": payload.get("email"),
                        "roles": roles or settings.default_roles,
                    }
                    # Store in state for consistency
                    request.state.user = user
            except Exception:
                pass  # Will fall through to dev_mode or 401
        
        if not user:
            if settings.dev_mode:
                return {
                    "sub": "dev-user",
                    "email": "dev@halcyon.local",
                    "roles": settings.default_roles,
                }
            raise HTTPException(status_code=401, detail="Not authenticated")
    return user
