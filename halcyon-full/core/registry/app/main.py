import os
import yaml
import asyncio
from typing import Dict, Any, Optional
from fastapi import FastAPI, Request, APIRouter
from fastapi.responses import JSONResponse
from pydantic_settings import BaseSettings
import httpx
import logging
from .logging import setup_logging
from .health import router as health_router
from .tracing import setup_tracing
from .sdk.http_poller import HttpPollerConnector
from .sdk.webhook import WebhookConnector
from .sdk.kafka_consumer import KafkaConsumerConnector

setup_logging()

logger = logging.getLogger("registry")

class Settings(BaseSettings):
    app_host: str = "0.0.0.0"
    app_port: int = 8090
    datasources_dir: str = "/app/datasources"
    ontology_base_url: str = "http://ontology:8081"
    gateway_base_url: str = "http://gateway:8088"
    kafka_brokers: str = os.getenv("KAFKA_BROKERS", "localhost:9092")

settings = Settings()
app = FastAPI(title="HALCYON Registry", version="0.1.0")

setup_tracing(app)

# Store connector instances
connectors: Dict[str, Any] = {}
webhook_router = APIRouter(prefix="/webhooks")


async def register_plugin(manifest_path: str):
    """Register plugin ontology entities/relationships."""
    with open(manifest_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    
    # Register ontology if present
    ontology_section = data.get("ontology", {})
    if ontology_section:
        ents = [{"name": e, "attributes": []} for e in ontology_section.get("entities", [])]
        rels = []
        for rel in ontology_section.get("relationships", []):
            # "A TYPE B"
            parts = rel.split()
            if len(parts) >= 3:
                rels.append({"name": parts[1], "from_entity": parts[0], "to_entity": parts[2], "directed": True, "attributes": []})
        patch = {"add_entities": ents, "add_relationships": rels}
        async with httpx.AsyncClient(base_url=settings.ontology_base_url, timeout=20) as c:
            r = await c.post("/ontology/patch", json=patch)
            r.raise_for_status()


def load_connector(plugin_data: Dict[str, Any], plugin_id: str) -> Optional[Any]:
    """Load and instantiate a connector from plugin.yaml data."""
    kind = plugin_data.get("kind")
    connector_id = plugin_data.get("id", plugin_id)
    config = plugin_data.get("config", {})

    # Load secrets from environment
    secrets = plugin_data.get("secrets", [])
    for secret_name in secrets:
        secret_value = os.getenv(secret_name)
        if secret_value:
            config[secret_name.lower()] = secret_value

    # Merge connector-specific config
    if kind == "http_poller":
        config["endpoint"] = plugin_data.get("endpoint", "")
        config["schedule"] = plugin_data.get("schedule", "every 60s")
        timeout_ms = int(os.getenv("CONNECTOR_HTTP_TIMEOUT_MS", "5000"))
        config["timeout_ms"] = timeout_ms
        config["mapping"] = plugin_data.get("mapping", {})
        return HttpPollerConnector(connector_id, config)
    
    elif kind == "webhook":
        config["mapping"] = plugin_data.get("mapping", {})
        connector = WebhookConnector(connector_id, config)
        return connector
    
    elif kind == "kafka":
        config["topic"] = plugin_data.get("topic", "")
        config["brokers"] = settings.kafka_brokers
        config["group_id"] = f"halcyon-{connector_id}"
        config["mapping"] = plugin_data.get("mapping", {})
        return KafkaConsumerConnector(connector_id, config)
    
    else:
        logger.warning(f"Unknown connector kind: {kind} for {connector_id}")
        return None


async def start_connector(connector: Any) -> None:
    """Start a connector and inject gateway_url into emit method."""
    # Wrap emit to inject gateway_url
    original_emit = connector.emit
    async def emit_with_gateway(raw, gateway_url=None):
        await original_emit(raw, gateway_url=settings.gateway_base_url)
    connector.emit = emit_with_gateway
    
    try:
        await connector.start()
        logger.info(f"Started connector: {connector.connector_id}")
        
        # Register webhook route if this is a webhook connector
        if isinstance(connector, WebhookConnector):
            connector_id = connector.connector_id
            
            @webhook_router.post(f"/{connector_id}")
            async def webhook_handler(request: Request):
                payload = await request.json()
                await connector.handle_webhook(payload)
                return JSONResponse({"status": "ok"})
            
            logger.info(f"Registered webhook route: /webhooks/{connector_id}")
    except Exception as e:
        logger.error(f"Failed to start connector {connector.connector_id}: {e}", exc_info=True)


@app.on_event("startup")
async def load_all():
    """Load all plugins and start connectors."""
    ds = settings.datasources_dir
    if not os.path.isdir(ds):
        logger.warning(f"Datasources directory not found: {ds}")
        return
    
    plugin_tasks = []
    connector_instances = []
    
    for root, _, files in os.walk(ds):
        for fn in files:
            if fn.endswith(".yaml") and "plugin" in fn:
                plugin_path = os.path.join(root, fn)
                try:
                    with open(plugin_path, "r", encoding="utf-8") as f:
                        plugin_data = yaml.safe_load(f)
                    
                    plugin_id = plugin_data.get("id", os.path.basename(root))
                    
                    # Register ontology
                    plugin_tasks.append(register_plugin(plugin_path))
                    
                    # Load connector if kind is specified
                    if plugin_data.get("kind"):
                        connector = load_connector(plugin_data, plugin_id)
                        if connector:
                            connectors[connector.connector_id] = connector
                            connector_instances.append(connector)
                
                except Exception as e:
                    logger.error(f"Error loading plugin {plugin_path}: {e}", exc_info=True)
    
    # Register ontology first
    if plugin_tasks:
        await asyncio.gather(*plugin_tasks, return_exceptions=True)
    
    # Start connectors
    if connector_instances:
        await asyncio.gather(*[start_connector(c) for c in connector_instances], return_exceptions=True)


@app.on_event("shutdown")
async def shutdown_connectors():
    """Stop all connectors on shutdown."""
    for connector in connectors.values():
        try:
            await connector.stop()
        except Exception as e:
            logger.error(f"Error stopping connector {connector.connector_id}: {e}")


# Registry routes for federation
from fastapi import APIRouter
from .cache import get_raw_documents, get_all_sources
sources_router = APIRouter(prefix="/sources")


@sources_router.get("/{source_id}/cache")
async def get_source_cache(source_id: str, limit: int = 200):
    """Get cached raw documents for a source connector."""
    docs = get_raw_documents(source_id, limit=limit)
    return docs


@sources_router.get("/{source_id}/config")
async def get_source_config(source_id: str):
    """Get mapping configuration for a source connector."""
    # Find connector and return its config mapping
    if source_id in connectors:
        connector = connectors[source_id]
        return {
            "id": connector.connector_id,
            "mapping": connector.config.get("mapping", {}),
        }
    return {"error": "Source not found"}


@sources_router.get("")
async def list_sources():
    """List all available sources."""
    return {"sources": get_all_sources()}


app.include_router(health_router)
app.include_router(webhook_router)
app.include_router(sources_router)
