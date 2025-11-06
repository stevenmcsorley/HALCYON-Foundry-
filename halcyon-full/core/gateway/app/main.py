from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError, ResponseValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from ariadne.asgi import GraphQL
from ariadne import make_executable_schema, load_schema_from_path
import uuid
from .config import settings
from .clients import OntologyClient, PolicyClient
from .resolvers import query, mutation
from .resolvers_fed import fed_query
from .resolvers_saved import saved_query as saved_query_resolver, saved_mutation
from .resolvers_alerts import alerts_query, alerts_mutation
from .resolvers_cases import cases_query, cases_mutation, case_type
from .resolvers_feedback import feedback_query, feedback_mutation
from .resolvers_actions import actions_query, actions_mutation
from .ws_pubsub import register_ws
from .health import router as health_router
from .routes_federation import router as federation_router
from .routes_saved import router as saved_queries_router, dashboard_router
from .routes_alerts import router as alerts_router
from .routes_silences import router as silences_router
from .routes_maintenance import router as maintenance_router
from .routes_cases import router as cases_router
from .routes_feedback import router as feedback_router
from .routes_actions import router as actions_router
from .retry_worker import start_retry_worker
from .db import init_db, close_pool
from .logging import setup_logging
from .tracing import setup_tracing
from .middleware import AuthMiddleware
import asyncio

setup_logging()

type_defs = load_schema_from_path("app/schema.graphql")
schema = make_executable_schema(
    type_defs,
    [query, fed_query, saved_query_resolver, alerts_query, cases_query, feedback_query, actions_query, case_type],
    [mutation, saved_mutation, alerts_mutation, cases_mutation, feedback_mutation, actions_mutation]
)

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
app.include_router(saved_queries_router)
app.include_router(dashboard_router)
app.include_router(alerts_router)
app.include_router(silences_router)
app.include_router(maintenance_router)
app.include_router(cases_router)
app.include_router(feedback_router)
app.include_router(actions_router)

@app.on_event("startup")
async def startup():
    """Initialize database on startup."""
    await init_db()
    # Start background retry worker for alert actions
    asyncio.create_task(start_retry_worker())

@app.on_event("shutdown")
async def shutdown():
    await ontology_client.close()
    await policy_client.close()
    await close_pool()

app.mount("/graphql", graphql_app)

# Exception handlers to ensure CORS headers are always added, even on errors
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Handle HTTP exceptions with CORS headers."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers={
            "Access-Control-Allow-Origin": "http://localhost:5173",
            "Access-Control-Allow-Credentials": "true",
        }
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle request validation errors with CORS headers."""
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
        headers={
            "Access-Control-Allow-Origin": "http://localhost:5173",
            "Access-Control-Allow-Credentials": "true",
        }
    )

@app.exception_handler(ResponseValidationError)
async def response_validation_exception_handler(request: Request, exc: ResponseValidationError):
    """Handle response validation errors with CORS headers."""
    import logging
    logger = logging.getLogger("gateway")
    logger.error(f"Response validation error: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error: response validation failed"},
        headers={
            "Access-Control-Allow-Origin": "http://localhost:5173",
            "Access-Control-Allow-Credentials": "true",
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle all other exceptions with CORS headers."""
    import logging
    logger = logging.getLogger("gateway")
    logger.exception(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
        headers={
            "Access-Control-Allow-Origin": "http://localhost:5173",
            "Access-Control-Allow-Credentials": "true",
        }
    )

def create_app(): return app
