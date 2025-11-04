from typing import Dict, Any
import logging
from .base import BaseConnector

logger = logging.getLogger("registry.connector.webhook")


class WebhookConnector(BaseConnector):
    """Webhook connector that receives POST requests and emits mapped entities."""

    def __init__(self, connector_id: str, config: Dict[str, Any]):
        super().__init__(connector_id, config)

    async def start(self) -> None:
        """Start the webhook connector (routes registered in main.py)."""
        self._set_running(True)
        logger.info(f"[{self.connector_id}] Webhook connector ready")

    async def stop(self) -> None:
        """Stop the webhook connector."""
        self._set_running(False)
        logger.info(f"[{self.connector_id}] Webhook connector stopped")

    def map(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """Map raw webhook payload to entity format."""
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
            import jsonpath_ng
            jsonpath_expr = jsonpath_ng.parse(path)
            matches = jsonpath_expr.find(data)
            if matches:
                return matches[0].value
        except Exception as e:
            logger.debug(f"[{self.connector_id}] JSONPath error for {path}: {e}")
        return None

    async def handle_webhook(self, payload: Dict[str, Any]) -> None:
        """Handle incoming webhook payload."""
        await self.emit(payload)
