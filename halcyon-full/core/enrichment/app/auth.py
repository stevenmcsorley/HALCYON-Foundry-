"""Authentication utilities for enrichment service."""
import os
import jwt
from typing import Optional, Dict, Any
from fastapi import Request, HTTPException, status


def verify_jwt_token(token: str) -> Optional[Dict[str, Any]]:
    """Verify JWT token and extract user info."""
    try:
        # For now, we'll decode without verification for dev mode
        # In production, you'd want to verify with Keycloak public key
        # For simplicity, we'll just decode and extract claims
        decoded = jwt.decode(token, options={"verify_signature": False})
        
        # Extract roles from Keycloak token format
        roles = []
        if "realm_access" in decoded and "roles" in decoded["realm_access"]:
            roles = decoded["realm_access"]["roles"]
        elif "roles" in decoded:
            roles = decoded["roles"]
        
        # If no roles found, add default analyst role
        if not roles:
            roles = ["analyst"]
        
        return {
            "sub": decoded.get("sub", "anonymous"),
            "roles": roles,
            "preferred_username": decoded.get("preferred_username", decoded.get("sub", "anonymous")),
        }
    except Exception as e:
        # Log error for debugging
        import logging
        logger = logging.getLogger("enrichment.auth")
        logger.debug(f"Token decode error: {e}")
        return None


async def get_current_user(request: Request) -> Optional[Dict[str, Any]]:
    """Extract current user from request."""
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        return None
    
    if not auth_header.startswith("Bearer "):
        return None
    
    token = auth_header.replace("Bearer ", "")
    return verify_jwt_token(token)


async def auth_middleware(request: Request, call_next):
    """Authentication middleware to extract user from JWT token."""
    # Skip auth for health endpoints
    if request.url.path.startswith("/health"):
        response = await call_next(request)
        return response
    
    # Extract user from token
    user = await get_current_user(request)
    if user:
        request.state.user = user
    else:
        # For unauthenticated requests, allow but with limited access
        request.state.user = {"sub": "anonymous", "roles": []}
    
    response = await call_next(request)
    return response

