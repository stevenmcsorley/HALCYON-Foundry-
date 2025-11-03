import httpx
from .config import settings

class OntologyClient:
    def __init__(self):
        self._client = httpx.AsyncClient(base_url=settings.ontology_base_url, timeout=20)
    async def upsert_entities(self, data: list[dict]) -> None:
        r = await self._client.post("/entities:upsert", json=data); r.raise_for_status()
    async def upsert_relationships(self, data: list[dict]) -> None:
        r = await self._client.post("/relationships:upsert", json=data); r.raise_for_status()
    async def close(self): await self._client.aclose()

class PolicyClient:
    def __init__(self):
        self._client = httpx.AsyncClient(timeout=10)
    async def allowed(self, input_: dict) -> bool:
        r = await self._client.post(settings.policy_base_url, json={"input": input_}); r.raise_for_status()
        data = r.json(); return bool(data.get("result", False))
    async def close(self): await self._client.aclose()
