import asyncio
import httpx
import jsonpath_ng
from typing import Dict, Any, Optional
import logging
from .base import BaseConnector

logger = logging.getLogger("registry.connector.http_poller")


class HttpPollerConnector(BaseConnector):
    """HTTP poller connector that periodically fetches JSON from an endpoint."""

    def __init__(self, connector_id: str, config: Dict[str, Any]):
        super().__init__(connector_id, config)
        self.endpoint = config.get("endpoint", "")
        self.schedule = config.get("schedule", "every 60s")
        self.timeout = config.get("timeout_ms", 5000) / 1000  # Convert to seconds
        self._task: Optional[asyncio.Task] = None
        self._client: Optional[httpx.AsyncClient] = None

    def _parse_schedule(self) -> float:
        """Parse schedule string like 'every 60s' to seconds."""
        schedule = self.schedule.lower().strip()
        if schedule.startswith("every "):
            schedule = schedule[6:]  # Remove "every "
        if schedule.endswith("s"):
            return float(schedule[:-1])
        elif schedule.endswith("m"):
            return float(schedule[:-1]) * 60
        elif schedule.endswith("h"):
            return float(schedule[:-1]) * 3600
        else:
            return 60.0  # Default to 60 seconds

    async def _poll(self) -> None:
        """Internal polling loop."""
        interval = self._parse_schedule()
        while self._running:
            try:
                if not self._client:
                    self._client = httpx.AsyncClient(timeout=self.timeout)
                
                response = await self._client.get(self.endpoint)
                response.raise_for_status()
                data = response.json()

                # Handle array of items or single object
                items = data if isinstance(data, list) else [data]
                for item in items:
                    await self.emit(item)

            except Exception as e:
                logger.error(f"[{self.connector_id}] Poll error: {e}", exc_info=True)
                from .base import connector_errors_total
                connector_errors_total.labels(
                    connector_id=self.connector_id,
                    error_type=type(e).__name__
                ).inc()

            await asyncio.sleep(interval)

    async def start(self) -> None:
        """Start polling."""
        if self._running:
            logger.warning(f"[{self.connector_id}] Already running")
            return
        
        if not self.endpoint:
            raise ValueError(f"[{self.connector_id}] Missing 'endpoint' in config")

        self._set_running(True)
        self._task = asyncio.create_task(self._poll())
        logger.info(f"[{self.connector_id}] Started HTTP poller for {self.endpoint}")

    async def stop(self) -> None:
        """Stop polling."""
        if not self._running:
            return
        
        self._set_running(False)
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        
        if self._client:
            await self._client.aclose()
            self._client = None
        
        logger.info(f"[{self.connector_id}] Stopped HTTP poller")

    def map(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """Map raw HTTP response data to entity format using mapping rules from config."""
        mapping = self.config.get("mapping", {})
        entity_type = mapping.get("entity_type", "Event")
        id_path = mapping.get("id", "$.id")
        
        # Extract ID using JSONPath
        id_value = self._extract_jsonpath(raw, id_path)
        if not id_value:
            id_value = f"{self.connector_id}-{hash(str(raw)) % 1000000}"

        # Extract attributes
        attrs = {}
        attrs_mapping = mapping.get("attrs", {})
        for key, path in attrs_mapping.items():
            value = self._extract_jsonpath(raw, path)
            if value is not None:
                attrs[key] = value

        return {
            "id": str(id_value),
            "type": entity_type,
            "attrs": attrs,
        }

    def _extract_jsonpath(self, data: Dict[str, Any], path: str) -> Any:
        """Extract value using JSONPath expression."""
        try:
            jsonpath_expr = jsonpath_ng.parse(path)
            matches = jsonpath_expr.find(data)
            if matches:
                return matches[0].value
        except Exception as e:
            logger.debug(f"[{self.connector_id}] JSONPath error for {path}: {e}")
        return None
