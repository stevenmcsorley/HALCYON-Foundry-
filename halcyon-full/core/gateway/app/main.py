from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from ariadne.asgi import GraphQL
from ariadne import make_executable_schema, load_schema_from_path
from .config import settings
from .clients import OntologyClient, PolicyClient
from .resolvers import query, mutation
from .ws_pubsub import register_ws

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

register_ws(app)

@app.on_event("shutdown")
async def shutdown():
    await ontology_client.close(); await policy_client.close()

@app.get("/healthz")
async def healthz(): return {"status": "ok"}

app.mount("/graphql", graphql_app)

def create_app(): return app
