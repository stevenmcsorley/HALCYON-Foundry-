import os
import httpx
import json
from typing import Optional, Dict, List
from jose import jwt, jwk
from jose.utils import base64url_decode
from .config import settings

JWKS_CACHE: Optional[Dict] = None
DISCOVERY_CACHE: Optional[Dict] = None


async def get_discovery_document() -> Dict:
    """Fetch OIDC discovery document with caching."""
    global DISCOVERY_CACHE
    if DISCOVERY_CACHE:
        return DISCOVERY_CACHE

    discovery_url = settings.oidc_discovery_url
    if not discovery_url:
        raise ValueError("OIDC_DISCOVERY_URL not configured")

    async with httpx.AsyncClient() as client:
        r = await client.get(discovery_url)
        r.raise_for_status()
        DISCOVERY_CACHE = r.json()
        return DISCOVERY_CACHE


async def get_jwks() -> Dict:
    """Fetch JWKS (JSON Web Key Set) with caching."""
    global JWKS_CACHE
    if JWKS_CACHE:
        return JWKS_CACHE

    discovery = await get_discovery_document()
    jwks_uri = discovery.get("jwks_uri")
    if not jwks_uri:
        raise ValueError("jwks_uri not found in discovery document")

    async with httpx.AsyncClient() as client:
        r = await client.get(jwks_uri)
        r.raise_for_status()
        JWKS_CACHE = r.json()
        return JWKS_CACHE


def get_signing_key(token: str, jwks: Dict) -> Optional[jwk.Key]:
    """Get the signing key for a JWT token."""
    try:
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        if not kid:
            return None

        for key in jwks.get("keys", []):
            if key.get("kid") == kid:
                return jwk.construct(key)
        return None
    except Exception:
        return None


async def verify_token(token: str) -> Optional[Dict]:
    """Verify JWT token and return decoded payload."""
    if settings.dev_mode:
        # In dev mode, skip verification for testing
        try:
            return jwt.get_unverified_claims(token)
        except Exception:
            return None

    try:
        jwks_data = await get_jwks()
        signing_key = get_signing_key(token, jwks_data)

        if not signing_key:
            return None

        discovery = await get_discovery_document()
        issuer = discovery.get("issuer")
        
        # For Keycloak, tokens can have audience as:
        # - UI client ID (halcyon-ui)
        # - Realm name (halcyon-dev)
        # - account (account service)
        # - Gateway client ID (halcyon-gateway) if client-to-client tokens
        # We accept any of these valid audiences
        from .config import settings as config_settings
        realm_name = config_settings.keycloak_realm
        valid_audiences = [
            "account",  # Keycloak account service
            realm_name,  # Realm name
            "halcyon-ui",  # UI client ID
            config_settings.keycloak_client_id,  # Gateway client ID (for client-to-client)
        ]

        payload = jwt.decode(
            token,
            signing_key,
            algorithms=[settings.jwt_algorithm],
            audience=valid_audiences,
            issuer=issuer,
            options={"verify_aud": True},
        )
        return payload
    except Exception:
        return None


def extract_roles(token_payload: Dict) -> List[str]:
    """Extract roles from token payload."""
    roles = []

    # Check realm_access.roles
    if "realm_access" in token_payload and "roles" in token_payload["realm_access"]:
        roles.extend(token_payload["realm_access"]["roles"])

    # Check resource_access[client].roles
    if "resource_access" in token_payload:
        client_id = settings.keycloak_client_id
        if client_id in token_payload["resource_access"]:
            client_roles = token_payload["resource_access"][client_id].get("roles", [])
            roles.extend(client_roles)

    return roles
