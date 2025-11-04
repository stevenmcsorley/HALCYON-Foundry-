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
    import logging
    logger = logging.getLogger("gateway.auth")
    
    if settings.dev_mode:
        # In dev mode, skip verification for testing
        try:
            return jwt.get_unverified_claims(token)
        except Exception as e:
            logger.warning(f"DEV_MODE token decode failed: {e}")
            return None

    try:
        jwks_data = await get_jwks()
        signing_key = get_signing_key(token, jwks_data)

        if not signing_key:
            logger.warning("No signing key found for token")
            return None

        discovery = await get_discovery_document()
        issuer = discovery.get("issuer")
        
        # Decode token without verification first to check if it has an audience claim
        unverified_payload = jwt.get_unverified_claims(token)
        has_audience = "aud" in unverified_payload
        
        # For Keycloak, tokens can have audience as:
        # - UI client ID (halcyon-ui)
        # - Realm name (halcyon-dev)
        # - account (account service)
        # - Gateway client ID (halcyon-gateway) if client-to-client tokens
        # Some Keycloak tokens (especially from public clients) may not have audience
        # Only validate audience if it's present in the token
        verify_options = {"verify_aud": has_audience}
        decode_kwargs = {
            "algorithms": [settings.jwt_algorithm],
            "issuer": issuer,
            "options": verify_options,
        }
        
        if has_audience:
            from .config import settings as config_settings
            realm_name = config_settings.keycloak_realm
            valid_audiences = [
                "account",  # Keycloak account service
                realm_name,  # Realm name
                "halcyon-ui",  # UI client ID
                config_settings.keycloak_client_id,  # Gateway client ID (for client-to-client)
            ]
            decode_kwargs["audience"] = valid_audiences

        payload = jwt.decode(token, signing_key, **decode_kwargs)
        logger.debug(f"Token verified successfully for subject: {payload.get('sub')}")
        return payload
    except jwt.ExpiredSignatureError:
        logger.warning("Token has expired")
        return None
    except jwt.JWTClaimsError as e:
        logger.warning(f"JWT claims validation failed: {e}")
        return None
    except jwt.JWTError as e:
        logger.warning(f"JWT validation error: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error during token verification: {e}", exc_info=True)
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
