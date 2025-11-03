import os, yaml, asyncio
from fastapi import FastAPI
from pydantic_settings import BaseSettings
import httpx

class Settings(BaseSettings):
  app_host: str = "0.0.0.0"
  app_port: int = 8090
  datasources_dir: str = "/app/datasources"
  ontology_base_url: str = "http://ontology:8081"

settings = Settings()
app = FastAPI(title="HALCYON Registry", version="0.1.0")

async def register_plugin(manifest_path: str):
  with open(manifest_path, "r", encoding="utf-8") as f:
    data = yaml.safe_load(f)
  ents = [{"name": e, "attributes": []} for e in data.get("ontology", {}).get("entities", [])]
  rels = []
  for rel in data.get("ontology", {}).get("relationships", []):
    # "A TYPE B"
    parts = rel.split()
    if len(parts) >= 3:
      rels.append({"name": parts[1], "from_entity": parts[0], "to_entity": parts[2], "directed": True, "attributes": []})
  patch = {"add_entities": ents, "add_relationships": rels}
  async with httpx.AsyncClient(base_url=settings.ontology_base_url, timeout=20) as c:
    r = await c.post("/ontology/patch", json=patch); r.raise_for_status()

@app.on_event("startup")
async def load_all():
  ds = settings.datasources_dir
  if not os.path.isdir(ds): return
  tasks = []
  for root, _, files in os.walk(ds):
    for fn in files:
      if fn.endswith(".yaml") and "plugin" in fn:
        tasks.append(register_plugin(os.path.join(root, fn)))
  if tasks: await asyncio.gather(*tasks)

@app.get("/healthz")
async def healthz(): return {"status": "ok"}
