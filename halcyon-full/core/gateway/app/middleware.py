from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from typing import Callable
import re
import logging
from .auth import verify_token, extract_roles
from .config import settings
from .metrics import auth_success_total, auth_failure_total

logger = logging.getLogger("gateway.middleware")


class AuthMiddleware(BaseHTTPMiddleware):
    """Middleware to extract and verify JWT tokens."""

    async def dispatch(self, request: Request, call_next: Callable):
        # Skip auth for OPTIONS requests (CORS preflight)
        if request.method == "OPTIONS":
            return await call_next(request)
        
        # Skip auth for health endpoints and metrics (but NOT /auth/user - we need to process it)
        # Also skip auth for GET /alerts/{id} - it's a public read-only endpoint for enrichment service
        path = request.url.path
        if path in ["/health", "/health/ready", "/metrics"]:
            return await call_next(request)
        
        # Allow GET /alerts/{id} without auth (for enrichment service)
        # Match pattern: /alerts/ followed by digits only (no trailing slash or query params)
        if request.method == "GET":
            # Strip query string for matching
            path_only = path.split('?')[0]
            logger.warning(f"MIDDLEWARE: Checking GET {path_only} for /alerts/{{id}} pattern")
            # Match /alerts/{numeric_id} exactly
            if re.match(r'^/alerts/\d+$', path_only):
                logger.warning(f"MIDDLEWARE: MATCH! Allowing public access to {path_only}")
                # This is /alerts/{id}, allow public read access
                # Set a default user so the route handler doesn't fail
                request.state.user = {"sub": "enrichment-service", "roles": ["viewer"]}
                return await call_next(request)
            else:
                logger.warning(f"MIDDLEWARE: No match for {path_only}")

        # Extract token from Authorization header
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            if settings.dev_mode:
                # In dev mode, use default roles if no token
                request.state.user = {
                    "sub": "dev-user",
                    "email": "dev@halcyon.local",
                    "roles": settings.default_roles,
                }
                auth_success_total.labels(method="dev_mode").inc()
                return await call_next(request)
            auth_failure_total.labels(reason="missing_token").inc()
            response = JSONResponse(
                status_code=401,
                content={"detail": "Missing or invalid Authorization header"}
            )
            # Add CORS headers manually since we're returning early
            response.headers["Access-Control-Allow-Origin"] = "http://localhost:5173"
            response.headers["Access-Control-Allow-Credentials"] = "true"
            return response

        token = auth_header.split(" ", 1)[1]
        
        failure_reason = "invalid_token"  # Default failure reason
        try:
            from jose import jwt as jose_jwt
            payload = await verify_token(token)
        except jose_jwt.ExpiredSignatureError:
            payload = None
            failure_reason = "expired_token"
        except jose_jwt.JWTClaimsError:
            payload = None
            failure_reason = "invalid_claims"
        except Exception:
            payload = None
            failure_reason = "invalid_token"

        if not payload:
            if settings.dev_mode:
                # In dev mode, fallback to defaults
                request.state.user = {
                    "sub": "dev-user",
                    "email": "dev@halcyon.local",
                    "roles": settings.default_roles,
                }
                auth_success_total.labels(method="dev_mode").inc()
                return await call_next(request)
            auth_failure_total.labels(reason=failure_reason).inc()
            response = JSONResponse(
                status_code=401,
                content={"detail": "Invalid or expired token"}
            )
            # Add CORS headers manually since we're returning early
            response.headers["Access-Control-Allow-Origin"] = "http://localhost:5173"
            response.headers["Access-Control-Allow-Credentials"] = "true"
            return response

        # Extract user info
        roles = extract_roles(payload)
        request.state.user = {
            "sub": payload.get("sub"),
            "email": payload.get("email"),
            "roles": roles or settings.default_roles,
        }

        auth_success_total.labels(method="jwt").inc()

        response = await call_next(request)
        return response
