import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from ariadne.asgi import GraphQL
from ariadne import make_executable_schema, load_schema_from_path
from .config import settings
from .clients import OntologyClient, PolicyClient
from .resolvers import query, mutation
from .websocket import manager

type_defs = load_schema_from_path("app/schema.graphql")
schema = make_executable_schema(type_defs, query, mutation)

app = FastAPI(title="HALCYON Gateway", version="0.1.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ontology_client = OntologyClient()
policy_client = PolicyClient()
graphql_app = GraphQL(schema, context_value=lambda req: {"request": req, "ontology": ontology_client, "policy": policy_client})

@app.on_event("startup")
async def startup():
    """Validate GraphQL schema on startup"""
    import logging
    try:
        # Self-test: execute a trivial query to ensure schema is valid
        from graphql import graphql_sync
        from graphql.error import GraphQLError
        
        test_query = "{ health }"
        result = graphql_sync(schema, test_query)
        if result.errors:
            errors_str = "; ".join(str(e) for e in result.errors)
            logging.error(f"GraphQL schema validation failed: {errors_str}")
            raise RuntimeError(f"Invalid GraphQL schema: {errors_str}")
        if not result.data or result.data.get("health") != "ok":
            logging.error(f"GraphQL health query returned unexpected result: {result.data}")
            raise RuntimeError(f"GraphQL health query failed: {result.data}")
        logging.info("✅ GraphQL schema validated successfully")
    except ImportError:
        # graphql-core might not be directly importable, try via ariadne
        logging.warning("graphql-core not directly importable, skipping schema validation")
    except Exception as e:
        logging.critical(f"❌ GraphQL schema validation error: {e}")
        raise

@app.on_event("shutdown")
async def shutdown():
    await ontology_client.close(); await policy_client.close()

@app.get("/healthz")
async def healthz(): return {"status": "ok"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time entity/relationship updates"""
    await websocket.accept()
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(json.dumps({"t": "pong"}))
    except WebSocketDisconnect:
        await manager.disconnect(websocket)
    except Exception as e:
        import logging
        logging.error(f"[WebSocket] Error: {e}")
        await manager.disconnect(websocket)
        raise

app.mount("/graphql", graphql_app)

def create_app(): return app
