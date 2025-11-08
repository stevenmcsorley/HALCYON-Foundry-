from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
import logging
from prometheus_client import Counter
import os
import asyncio
import time

logger = logging.getLogger("registry.connector")

# Global metrics (will be initialized per connector)
connector_events_total = Counter(
    "connector_events_total",
    "Total number of events emitted by connector",
    ["connector_id"],
)

connector_errors_total = Counter(
    "connector_errors_total",
    "Total number of errors from connector",
    ["connector_id", "error_type"],
)

_TOKEN_CACHE: Dict[str, Any] = {"token": None, "expires_at": 0.0}
_TOKEN_LOCK = asyncio.Lock()
_TOKEN_WARNED = False
_KEYCLOAK_URL = os.getenv("KEYCLOAK_URL")
_KEYCLOAK_REALM = os.getenv("KEYCLOAK_REALM")
_KEYCLOAK_CLIENT_ID = os.getenv("KEYCLOAK_CLIENT_ID")
_KEYCLOAK_CLIENT_SECRET = os.getenv("KEYCLOAK_CLIENT_SECRET")


async def _get_service_token() -> Optional[str]:
    """Fetch a bearer token for internal Gateway calls using client credentials."""
    if not all([_KEYCLOAK_URL, _KEYCLOAK_REALM, _KEYCLOAK_CLIENT_ID, _KEYCLOAK_CLIENT_SECRET]):
        return None

    now = time.time()
    if _TOKEN_CACHE["token"] and now < (_TOKEN_CACHE.get("expires_at") or 0):
        return _TOKEN_CACHE["token"]

    async with _TOKEN_LOCK:
        # Re-check after acquiring lock
        now = time.time()
        if _TOKEN_CACHE["token"] and now < (_TOKEN_CACHE.get("expires_at") or 0):
            return _TOKEN_CACHE["token"]

        token_url = f"{_KEYCLOAK_URL}/realms/{_KEYCLOAK_REALM}/protocol/openid-connect/token"
        data = {
            "grant_type": "client_credentials",
            "client_id": _KEYCLOAK_CLIENT_ID,
            "client_secret": _KEYCLOAK_CLIENT_SECRET,
        }

        try:
            import httpx

            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(
                    token_url,
                    data=data,
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
                response.raise_for_status()
                payload = response.json()
        except Exception as exc:
            logger.error("Failed to fetch registry service token: %s", exc)
            _TOKEN_CACHE["token"] = None
            _TOKEN_CACHE["expires_at"] = 0.0
            return None

        token = payload.get("access_token")
        if not token:
            logger.error("Keycloak token response missing access_token: %s", payload)
            _TOKEN_CACHE["token"] = None
            _TOKEN_CACHE["expires_at"] = 0.0
            return None

        expires_in = payload.get("expires_in", 300)
        try:
            expires_in = int(expires_in)
        except (ValueError, TypeError):
            expires_in = 300

        # Renew slightly before expiry
        _TOKEN_CACHE["token"] = token
        _TOKEN_CACHE["expires_at"] = time.time() + max(expires_in - 30, 30)
        return token


class BaseConnector(ABC):
    """Base class for all datasource connectors."""

    def __init__(self, connector_id: str, config: Dict[str, Any]):
        self.connector_id = connector_id
        self.config = config
        self._running = False

    @abstractmethod
    async def start(self) -> None:
        """Start the connector (e.g., start polling, listening, consuming)."""
        pass

    @abstractmethod
    async def stop(self) -> None:
        """Stop the connector gracefully."""
        pass

    @abstractmethod
    def map(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """
        Map raw data to HALCYON entity format.
        
        Returns:
            {
                "id": str,
                "type": str,
                "attrs": Dict[str, Any]
            }
        """
        pass

    async def emit(self, raw: Dict[str, Any], gateway_url: Optional[str] = None) -> None:
        """
        Map raw data and emit as entity event.
        
        This should be called by connector implementations after receiving raw data.
        
        Args:
            raw: Raw data from the datasource
            gateway_url: Gateway base URL for sending entities (injected by Registry)
        """
        try:
            mapped = self.map(raw)
            if not mapped or not mapped.get("id"):
                logger.warning(f"[{self.connector_id}] Skipping invalid mapped data: {mapped}")
                return

            logger.info(f"[{self.connector_id}] Emitted entity: {mapped['id']} ({mapped['type']})")
            
            # Store raw document in cache for federation queries
            try:
                from ..cache import store_raw_document
                store_raw_document(self.connector_id, raw)
            except Exception as e:
                logger.debug(f"[{self.connector_id}] Failed to cache raw document: {e}")
            
            # Send directly to Ontology service (bypass Gateway auth)
            # Gateway requires auth, but Registry is a backend service
            # Use ONTOLOGY_BASE_URL if available, otherwise try gateway_url
            ontology_url = os.getenv("ONTOLOGY_BASE_URL") or (gateway_url.replace("/graphql", "").replace(":8088", ":8081") if gateway_url else None)

            entity_payload = {
                "id": mapped["id"],
                "type": mapped["type"],
                "attrs": mapped.get("attrs", {}),
            }

            if ontology_url:
                try:
                    import httpx

                    async with httpx.AsyncClient(base_url=ontology_url, timeout=10) as client:
                        response = await client.post(
                            "/entities:upsert",
                            json=[entity_payload],  # Ontology expects array
                            headers={"Content-Type": "application/json"},
                        )
                        response.raise_for_status()
                except Exception as e:
                    logger.error(f"[{self.connector_id}] Failed to send entity to Ontology: {e}")
                    # Continue - we still count the event as emitted

            # Notify the Gateway so alert rules and automations run
            target_gateway = gateway_url or os.getenv("GATEWAY_BASE_URL") or "http://gateway:8088"
            if target_gateway:
                logger.debug("[%s] Preparing to notify Gateway at %s", self.connector_id, target_gateway)
                try:
                    import httpx
                    global _TOKEN_WARNED

                    gql_payload = {
                        "query": "mutation($input:[EntityInput!]!){ upsertEntities(input:$input) }",
                        "variables": {"input": [entity_payload]},
                    }
                    headers = {"Content-Type": "application/json"}
                    token = await _get_service_token()
                    if token:
                        headers["Authorization"] = f"Bearer {token}"
                        _TOKEN_WARNED = False
                    else:
                        if not _TOKEN_WARNED:
                            logger.warning(
                                "[%s] Missing service token for Gateway call; ensure KEYCLOAK_* env vars are set",
                                self.connector_id,
                            )
                            _TOKEN_WARNED = True

                    async with httpx.AsyncClient(base_url=target_gateway, timeout=10) as client:
                        logger.info("[%s] Posting upsertEntities to %s for %s", self.connector_id, target_gateway, entity_payload["id"])
                        response = await client.post("/graphql/", json=gql_payload, headers=headers)
                        response.raise_for_status()
                except Exception as e:
                    logger.error(f"[{self.connector_id}] Failed to notify Gateway about entity {entity_payload['id']}: {e}")
            else:
                logger.warning("[%s] No gateway URL provided; skipping alert notification", self.connector_id)

            connector_events_total.labels(connector_id=self.connector_id).inc()

        except Exception as e:
            logger.error(f"[{self.connector_id}] Error mapping/emitting event: {e}", exc_info=True)
            connector_errors_total.labels(
                connector_id=self.connector_id,
                error_type=type(e).__name__
            ).inc()

    @property
    def is_running(self) -> bool:
        """Check if connector is currently running."""
        return self._running

    def _set_running(self, value: bool) -> None:
        """Internal method to update running state."""
        self._running = value
