from fastapi import FastAPI
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
  app_host: str = "0.0.0.0"
  app_port: int = 8091
  ontology_base_url: str = "http://ontology:8081"
settings = Settings()

app = FastAPI(title="HALCYON Enrichment", version="0.1.0")

@app.get("/healthz")
async def healthz(): return {"status":"ok"}
