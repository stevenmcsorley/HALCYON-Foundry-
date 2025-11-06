from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic_settings import BaseSettings
from .logging import setup_logging
from .health import router as health_router
from .tracing import setup_tracing
from .routes_enrichment import router as enrichment_router
from .routes_playbooks import router as playbooks_router
from .db import close_pool
from .auth import auth_middleware

setup_logging()

class Settings(BaseSettings):
  app_host: str = "0.0.0.0"
  app_port: int = 8091
  ontology_base_url: str = "http://ontology:8081"
  database_url: str = "postgresql://postgres:postgres@postgres:5432/halcyon"
settings = Settings()

app = FastAPI(title="HALCYON Enrichment", version="0.1.0")

setup_tracing(app)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Authentication middleware
app.add_middleware(BaseHTTPMiddleware, dispatch=auth_middleware)

app.include_router(health_router)
app.include_router(enrichment_router)
app.include_router(playbooks_router)


@app.on_event("shutdown")
async def shutdown():
    """Close database pool on shutdown."""
    await close_pool()
