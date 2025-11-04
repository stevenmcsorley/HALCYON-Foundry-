import httpx
from .config import settings

class OntologyClient:
    def __init__(self):
        self._client = httpx.AsyncClient(base_url=settings.ontology_base_url, timeout=20)
    async def upsert_entities(self, data: list[dict]) -> None:
        r = await self._client.post("/entities:upsert", json=data); r.raise_for_status()
    async def upsert_relationships(self, data: list[dict]) -> None:
        r = await self._client.post("/relationships:upsert", json=data); r.raise_for_status()
    async def get_entities(self, entity_type: str | None = None) -> list[dict]:
        params = {"entity_type": entity_type} if entity_type else {}
        r = await self._client.get("/entities", params=params); r.raise_for_status()
        return r.json()
    async def get_entity(self, entity_id: str) -> dict:
        r = await self._client.get(f"/entities/{entity_id}"); r.raise_for_status()
        return r.json()
    async def get_relationships(self, rel_type: str | None = None, from_id: str | None = None, to_id: str | None = None) -> list[dict]:
        params = {}
        if rel_type:
            params["type"] = rel_type
        if from_id:
            params["fromId"] = from_id
        if to_id:
            params["toId"] = to_id
        r = await self._client.get("/relationships", params=params); r.raise_for_status()
        return r.json()
    async def close(self): await self._client.aclose()

class PolicyClient:
    def __init__(self):
        self._client = httpx.AsyncClient(timeout=10)
    async def allowed(self, input_: dict) -> bool:
        r = await self._client.post(settings.policy_base_url, json={"input": input_}); r.raise_for_status()
        data = r.json(); return bool(data.get("result", False))
    async def close(self): await self._client.aclose()
