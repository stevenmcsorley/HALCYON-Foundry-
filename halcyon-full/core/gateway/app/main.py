from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from ariadne.asgi import GraphQL
from ariadne import make_executable_schema, load_schema_from_path
import uuid
from .config import settings
from .clients import OntologyClient, PolicyClient
from .resolvers import query, mutation
from .resolvers_fed import fed_query
from .ws_pubsub import register_ws
from .health import router as health_router
from .routes_federation import router as federation_router
from .logging import setup_logging
from .tracing import setup_tracing
from .middleware import AuthMiddleware

setup_logging()

type_defs = load_schema_from_path("app/schema.graphql")
schema = make_executable_schema(type_defs, [query, fed_query], mutation)

app = FastAPI(title="HALCYON Gateway", version="0.1.0")

setup_tracing(app)

# Add CORS middleware FIRST to ensure headers are added to all responses (including errors)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add auth middleware AFTER CORS
app.add_middleware(AuthMiddleware)

# Middleware to add X-Trace-ID to all responses
@app.middleware("http")
async def add_trace_id(request: Request, call_next):
    # Use existing trace ID from headers if present, otherwise generate one
    trace_id = request.headers.get("X-Trace-ID") or str(uuid.uuid4())
    
    # Store in request state for logging
    request.state.trace_id = trace_id
    
    response = await call_next(request)
    
    # Add X-Trace-ID to response headers
    response.headers["X-Trace-ID"] = trace_id
    
    return response

ontology_client = OntologyClient()
policy_client = PolicyClient()

def get_context(req):
    """Create GraphQL context with user info from request state."""
    context = {
        "request": req,
        "ontology": ontology_client,
        "policy": policy_client,
    }
    # Add user info from middleware if available
    # Ariadne passes ASGI scope, state is in scope["state"]
    state = req.scope.get("state", {})
    if hasattr(state, "user"):
        context["user"] = state.user
    elif "user" in state:
        context["user"] = state["user"]
    else:
        # Fallback for dev mode
        context["user"] = {
            "sub": "dev-user",
            "email": "dev@halcyon.local",
            "roles": settings.default_roles,
        }
    return context

graphql_app = GraphQL(schema, context_value=get_context)

register_ws(app)
app.include_router(health_router)
app.include_router(federation_router)

@app.on_event("shutdown")
async def shutdown():
    await ontology_client.close(); await policy_client.close()

app.mount("/graphql", graphql_app)

def create_app(): return app
