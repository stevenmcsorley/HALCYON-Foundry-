from fastapi import FastAPI
from pydantic_settings import BaseSettings
from .logging import setup_logging
from .health import router as health_router
from .tracing import setup_tracing

setup_logging()

class Settings(BaseSettings):
  app_host: str = "0.0.0.0"
  app_port: int = 8091
  ontology_base_url: str = "http://ontology:8081"
settings = Settings()

app = FastAPI(title="HALCYON Enrichment", version="0.1.0")

setup_tracing(app)

app.include_router(health_router)
