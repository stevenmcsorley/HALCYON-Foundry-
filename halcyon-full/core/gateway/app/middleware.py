from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from typing import Callable
from .auth import verify_token, extract_roles
from .config import settings


class AuthMiddleware(BaseHTTPMiddleware):
    """Middleware to extract and verify JWT tokens."""

    async def dispatch(self, request: Request, call_next: Callable):
        # Skip auth for OPTIONS requests (CORS preflight)
        if request.method == "OPTIONS":
            return await call_next(request)
        
        # Skip auth for health endpoints and /auth/user (will handle separately)
        if request.url.path in ["/health", "/health/ready", "/metrics", "/auth/user"]:
            return await call_next(request)

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
                return await call_next(request)
            response = JSONResponse(
                status_code=401,
                content={"detail": "Missing or invalid Authorization header"}
            )
            # Add CORS headers manually since we're returning early
            response.headers["Access-Control-Allow-Origin"] = "http://localhost:5173"
            response.headers["Access-Control-Allow-Credentials"] = "true"
            return response

        token = auth_header.split(" ", 1)[1]
        
        try:
            payload = await verify_token(token)
        except Exception:
            payload = None

        if not payload:
            if settings.dev_mode:
                # In dev mode, fallback to defaults
                request.state.user = {
                    "sub": "dev-user",
                    "email": "dev@halcyon.local",
                    "roles": settings.default_roles,
                }
                return await call_next(request)
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

        response = await call_next(request)
        return response
