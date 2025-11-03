from typing import Iterable
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
            async with session.begin_transaction() as tx:
                for e in entities:
                    await tx.run(
                        f"MERGE (n:{'{'}e.type{'}'} {{id:$id}}) SET n += $attrs",
                        id=e.id, attrs=e.attrs
                    )

    async def upsert_relationships(self, rels: Iterable[RelationshipInstance]) -> None:
        async with self._driver.session() as session:
            async with session.begin_transaction() as tx:
                for r in rels:
                    await tx.run(
                        f"""
                        MATCH (a {{id:$from_id}}), (b {{id:$to_id}})
                        MERGE (a)-[x:{'{'}r.type{'}'}]->(b)
                        SET x += $attrs
                        """, from_id=r.from_id, to_id=r.to_id, attrs=r.attrs
                    )
