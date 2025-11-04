from typing import Dict, Any, Optional
import logging
from .base import BaseConnector

logger = logging.getLogger("registry.connector.kafka")

try:
    from aiokafka import AIOKafkaConsumer
    import json
    KAFKA_AVAILABLE = True
except ImportError:
    KAFKA_AVAILABLE = False
    logger.warning("aiokafka not installed, Kafka connector will not work")


class KafkaConsumerConnector(BaseConnector):
    """Kafka consumer connector that reads from a topic and emits mapped entities."""

    def __init__(self, connector_id: str, config: Dict[str, Any]):
        super().__init__(connector_id, config)
        self.topic = config.get("topic", "")
        self.brokers = config.get("brokers", "localhost:9092")
        self.group_id = config.get("group_id", f"halcyon-{connector_id}")
        self._consumer: Optional[Any] = None
        self._task: Optional[Any] = None

    async def start(self) -> None:
        """Start consuming from Kafka topic."""
        if not KAFKA_AVAILABLE:
            raise RuntimeError("aiokafka not installed. Install with: pip install aiokafka")

        if self._running:
            logger.warning(f"[{self.connector_id}] Already running")
            return

        if not self.topic:
            raise ValueError(f"[{self.connector_id}] Missing 'topic' in config")

        brokers_list = self.brokers.split(",") if isinstance(self.brokers, str) else self.brokers

        self._consumer = AIOKafkaConsumer(
            self.topic,
            bootstrap_servers=brokers_list,
            group_id=self.group_id,
            value_deserializer=lambda m: json.loads(m.decode('utf-8')) if m else None,
        )

        await self._consumer.start()
        self._set_running(True)

        # Start consuming task
        import asyncio
        self._task = asyncio.create_task(self._consume())
        logger.info(f"[{self.connector_id}] Started Kafka consumer for topic: {self.topic}")

    async def _consume(self) -> None:
        """Internal consumption loop."""
        try:
            async for message in self._consumer:
                if not self._running:
                    break
                
                try:
                    value = message.value
                    if value:
                        await self.emit(value)
                except Exception as e:
                    logger.error(f"[{self.connector_id}] Error processing message: {e}", exc_info=True)
                    from .base import connector_errors_total
                    connector_errors_total.labels(
                        connector_id=self.connector_id,
                        error_type=type(e).__name__
                    ).inc()
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"[{self.connector_id}] Consumer error: {e}", exc_info=True)

    async def stop(self) -> None:
        """Stop consuming."""
        if not self._running:
            return

        self._set_running(False)
        
        if self._task:
            self._task.cancel()
            try:
                import asyncio
                await self._task
            except asyncio.CancelledError:
                pass

        if self._consumer:
            await self._consumer.stop()
            self._consumer = None

        logger.info(f"[{self.connector_id}] Stopped Kafka consumer")

    def map(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """Map raw Kafka message to entity format."""
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
