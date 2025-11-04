from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
import logging
from prometheus_client import Counter
import os

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
            
            # Send to Gateway via GraphQL mutation
            if gateway_url:
                try:
                    import httpx
                    mutation = """
                    mutation UpsertEntity($input: EntityInput!) {
                      entities:upsert(input: $input) {
                        id
                        type
                      }
                    }
                    """
                    variables = {
                        "input": {
                            "id": mapped["id"],
                            "type": mapped["type"],
                            "attrs": mapped.get("attrs", {})
                        }
                    }
                    async with httpx.AsyncClient(base_url=gateway_url, timeout=10) as client:
                        response = await client.post(
                            "/graphql",
                            json={"query": mutation, "variables": variables},
                            headers={"Content-Type": "application/json"}
                        )
                        response.raise_for_status()
                except Exception as e:
                    logger.error(f"[{self.connector_id}] Failed to send entity to Gateway: {e}")
                    # Continue - we still count the event as emitted
            
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
