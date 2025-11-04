from typing import Iterable
from datetime import datetime
from neo4j import AsyncGraphDatabase
import asyncpg
from .models import EntityType, RelationshipType, EntityInstance, RelationshipInstance
from .config import settings


class MetaStore:
    def __init__(self) -> None:
        self._pool: asyncpg.Pool | None = None

    async def start(self) -> None:
        self._pool = await asyncpg.create_pool(str(settings.pg_dsn))

    async def stop(self) -> None:
        if self._pool:
            await self._pool.close()

    async def register_entity_types(self, types: Iterable[EntityType]) -> None:
        if not self._pool:
            raise RuntimeError("MetaStore not started")
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                for t in types:
                    await conn.execute(
                        """
                        insert into entity_types(name, spec, version)
                        values($1, $2::jsonb, $3)
                        on conflict (name) do update set spec = EXCLUDED.spec, version = EXCLUDED.version
                        """, t.name, t.model_dump_json(), t.version
                    )

    async def register_relationship_types(self, types: Iterable[RelationshipType]) -> None:
        if not self._pool:
            raise RuntimeError("MetaStore not started")
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                for r in types:
                    await conn.execute(
                        """
                        insert into relationship_types(name, spec, version)
                        values($1, $2::jsonb, $3)
                        on conflict (name) do update set spec = EXCLUDED.spec, version = EXCLUDED.version
                        """, r.name, r.model_dump_json(), r.version
                    )


class GraphStore:
    def __init__(self) -> None:
        self._driver = AsyncGraphDatabase.driver(
            str(settings.neo4j_uri), auth=(settings.neo4j_user, settings.neo4j_pass)
        )

    async def close(self) -> None:
        await self._driver.close()

    async def upsert_entities(self, entities: Iterable[EntityInstance]) -> None:
        async with self._driver.session() as session:
            tx = await session.begin_transaction()
            try:
                for e in entities:
                    # Ensure timestamp is present (server-generated ISO if missing)
                    attrs = dict(e.attrs) if e.attrs else {}
                    if "timestamp" not in attrs:
                        attrs["timestamp"] = datetime.utcnow().isoformat() + "Z"
                    
                    # Use backticks for label with special characters, escape if needed
                    label = e.type.replace('`', '``')  # Escape backticks in label
                    await tx.run(
                        f"MERGE (n:`{label}` {{id:$id}}) SET n += $attrs, n.id = $id",
                        id=e.id, attrs=attrs
                    )
                await tx.commit()
            except Exception:
                await tx.rollback()
                raise
            finally:
                await tx.close()

    async def upsert_relationships(self, rels: Iterable[RelationshipInstance]) -> None:
        async with self._driver.session() as session:
            tx = await session.begin_transaction()
            try:
                for r in rels:
                    # Ensure timestamp is present (server-generated ISO if missing)
                    attrs = dict(r.attrs) if r.attrs else {}
                    if "timestamp" not in attrs:
                        attrs["timestamp"] = datetime.utcnow().isoformat() + "Z"
                    
                    rel_type = r.type.replace('`', '``')  # Escape backticks in relationship type
                    await tx.run(
                        f"""
                        MATCH (a {{id:$from_id}}), (b {{id:$to_id}})
                        MERGE (a)-[x:`{rel_type}`]->(b)
                        SET x += $attrs
                        """, from_id=r.from_id, to_id=r.to_id, attrs=attrs
                    )
                await tx.commit()
            except Exception:
                await tx.rollback()
                raise
            finally:
                await tx.close()

    async def get_entities(self, entity_type: str | None = None) -> list[dict]:
        async with self._driver.session() as session:
            if entity_type:
                # Escape backticks in label (same as upsert_entities)
                label = entity_type.replace('`', '``')
                result = await session.run(
                    f"MATCH (n:`{label}`) RETURN n.id as id, labels(n)[0] as type, properties(n) as attrs"
                )
            else:
                result = await session.run("MATCH (n) RETURN n.id as id, labels(n)[0] as type, properties(n) as attrs")
            entities = []
            async for record in result:
                attrs = dict(record["attrs"])
                attrs.pop("id", None)  # Remove id from attrs since we have it separately
                entities.append({
                    "id": record["id"],
                    "type": record["type"],
                    "attrs": attrs
                })
            return entities

    async def get_entity(self, entity_id: str) -> dict | None:
        async with self._driver.session() as session:
            result = await session.run(
                "MATCH (n) WHERE n.id = $id RETURN n.id as id, labels(n)[0] as type, properties(n) as attrs",
                id=entity_id
            )
            record = await result.single()
            if not record:
                return None
            attrs = dict(record["attrs"])
            attrs.pop("id", None)  # Remove id from attrs since we have it separately
            return {
                "id": record["id"],
                "type": record["type"],
                "attrs": attrs
            }

    async def get_relationships(self) -> list[dict]:
        async with self._driver.session() as session:
            result = await session.run("""
                MATCH (a)-[r]->(b)
                RETURN type(r) as type, a.id as fromId, b.id as toId, properties(r) as attrs
            """)
            relationships = []
            async for record in result:
                relationships.append({
                    "type": record["type"],
                    "fromId": record["fromId"],
                    "toId": record["toId"],
                    "attrs": dict(record["attrs"]) if record["attrs"] else {}
                })
            return relationships
