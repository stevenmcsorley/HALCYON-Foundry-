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
        discovery_issuer = discovery.get("issuer")
        
        # Decode token without verification first to check issuer and audience
        unverified_payload = jwt.get_unverified_claims(token)
        token_issuer = unverified_payload.get("iss")
        has_audience = "aud" in unverified_payload
        
        # Keycloak may issue tokens with different issuer URLs (internal vs external)
        # Accept both internal (keycloak:8080) and external (localhost:8089) variants
        # Normalize by comparing the path portion which should be the same
        def normalize_issuer(iss: str) -> str:
            """Normalize issuer URL to compare only the path/realm portion."""
            if not iss:
                return ""
            # Extract path after /realms/
            if "/realms/" in iss:
                return iss.split("/realms/", 1)[1]
            return iss
        
        # Use the token's issuer for validation (it's what Keycloak actually issued)
        # But we need to ensure it's from the same realm
        if normalize_issuer(token_issuer) != normalize_issuer(discovery_issuer):
            logger.warning(f"Issuer mismatch: token={token_issuer}, discovery={discovery_issuer}")
            return None
        
        # Use token issuer for validation (it's the authoritative one)
        issuer = token_issuer
        
        # For Keycloak, tokens can have audience as:
        # - UI client ID (halcyon-ui)
        # - Realm name (halcyon-dev)
        # - account (account service)
        # - Gateway client ID (halcyon-gateway) if client-to-client tokens
        # Some Keycloak tokens (especially from public clients) may not have audience
        # Only validate audience if it's present in the token
        verify_options = {"verify_aud": False}
        decode_kwargs = {
            "algorithms": [settings.jwt_algorithm],
            "issuer": issuer,
            "options": verify_options,
        }
        
        if has_audience:
            from .config import settings as config_settings
            realm_name = config_settings.keycloak_realm
            valid_audiences = {
                "account",  # Keycloak account service
                realm_name,  # Realm name
                "halcyon-ui",  # UI client ID
                config_settings.keycloak_client_id,  # Gateway client ID (for client-to-client)
            }
            aud_claim = unverified_payload.get("aud")
            if isinstance(aud_claim, str):
                if aud_claim not in valid_audiences:
                    logger.warning(f"Unexpected audience in token: {aud_claim}")
                    return None
            elif isinstance(aud_claim, (list, tuple, set)):
                match = next((aud for aud in aud_claim if aud in valid_audiences), None)
                if not match:
                    logger.warning(f"Unexpected audience list in token: {aud_claim}")
                    return None
            else:
                logger.warning(f"Unsupported audience type in token: {type(aud_claim)}")
                return None

        payload = jwt.decode(token, signing_key, **decode_kwargs)
        logger.debug(f"Token verified successfully for subject: {payload.get('sub')}")
        return payload
    except jwt.ExpiredSignatureError:
        logger.warning("Token has expired")
        raise  # Re-raise so middleware can distinguish expired tokens
    except jwt.JWTClaimsError as e:
        logger.warning(f"JWT claims validation failed: {e}")
        raise  # Re-raise so middleware can distinguish claim errors
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
