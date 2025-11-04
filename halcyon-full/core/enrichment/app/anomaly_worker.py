import asyncio
import httpx
import json
from typing import Dict, Any, Optional
from datetime import datetime
import logging
from .anomaly_rules import load_rules, match_rule
from .anomaly_stats import AnomalyStatsTracker
# Gateway URL for sending anomalies
GATEWAY_URL = "http://gateway:8088"

logger = logging.getLogger("enrichment.anomaly_worker")


class AnomalyWorker:
    """Worker that detects anomalies and emits Anomaly entities."""
    
    def __init__(self):
        self.stats_tracker = AnomalyStatsTracker()
        self.rules = load_rules()
        self.running = False
        self._task: Optional[asyncio.Task] = None
        self.event_queue: asyncio.Queue = asyncio.Queue()
    
    async def process_event(self, entity: Dict[str, Any]) -> None:
        """Process an event for anomaly detection."""
        try:
            # Check each rule
            for rule in self.rules:
                if not match_rule(entity, rule):
                    continue
                
                # Add to stats
                window = rule.get("window", "5m")
                self.stats_tracker.add_event(rule["name"], entity, window)
                
                # Check z-score threshold
                threshold = rule.get("zscore_gt", 3.0)
                is_anomaly, z_score = self.stats_tracker.check_zscore(rule["name"], entity, threshold)
                
                if is_anomaly:
                    await self._emit_anomaly(rule, entity, z_score)
                    
        except Exception as e:
            logger.error(f"Error processing event for anomaly detection: {e}", exc_info=True)
    
    async def _emit_anomaly(self, rule: Dict[str, Any], entity: Dict[str, Any], z_score: float) -> None:
        """Emit an Anomaly entity via Gateway."""
        try:
            anomaly_id = f"anomaly-{rule['name']}-{datetime.utcnow().isoformat()}"
            emits_config = rule.get("emits", {})
            anomaly_type = emits_config.get("type", "Anomaly")
            link_to = emits_config.get("link_to", "Event")
            
            # Create anomaly entity
            anomaly = {
                "id": anomaly_id,
                "type": anomaly_type,
                "attrs": {
                    "rule": rule["name"],
                    "z_score": z_score,
                    "detected_at": datetime.utcnow().isoformat() + "Z",
                    "source_entity_id": entity.get("id"),
                    "source_entity_type": entity.get("type"),
                }
            }
            
            # Send to Gateway via GraphQL mutation
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
                    "id": anomaly["id"],
                    "type": anomaly["type"],
                    "attrs": anomaly["attrs"]
                }
            }
            
            gateway_url = GATEWAY_URL
            async with httpx.AsyncClient(base_url=gateway_url, timeout=10) as client:
                response = await client.post(
                    "/graphql",
                    json={"query": mutation, "variables": variables},
                    headers={"Content-Type": "application/json"}
                )
                response.raise_for_status()
                
                # Create AFFECTS relationship if link_to is specified
                if link_to and entity.get("id"):
                    rel_mutation = """
                    mutation UpsertRelationship($input: RelationshipInput!) {
                      relationships:upsert(input: $input)
                    }
                    """
                    rel_variables = {
                        "input": {
                            "type": "AFFECTS",
                            "fromId": anomaly["id"],
                            "toId": entity["id"],
                            "attrs": {}
                        }
                    }
                    await client.post(
                        "/graphql",
                        json={"query": rel_mutation, "variables": rel_variables},
                        headers={"Content-Type": "application/json"}
                    )
            
            logger.info(f"Emitted anomaly: {anomaly_id} for rule {rule['name']} (z={z_score:.2f})")
            
        except Exception as e:
            logger.error(f"Failed to emit anomaly: {e}", exc_info=True)
