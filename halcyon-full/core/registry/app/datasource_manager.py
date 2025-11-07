from __future__ import annotations

import logging
from typing import Dict, Any
from uuid import UUID

from .db import get_pool


logger = logging.getLogger("registry.datasources")


class DatasourceManager:
    """Lightweight datasource manager that will orchestrate connectors in future phases."""

    def __init__(self) -> None:
        self._datasources: Dict[UUID, Dict[str, Any]] = {}

    @property
    def datasources(self) -> Dict[UUID, Dict[str, Any]]:
        return self._datasources

    async def load_active_datasources(self) -> Dict[UUID, Dict[str, Any]]:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT d.id,
                       d.name,
                       d.type,
                       d.status,
                       d.owner_id,
                       d.org_id,
                       d.project_id,
                       d.tags,
                       d.updated_at,
                       v.version AS published_version,
                       v.config_json
                FROM datasources d
                LEFT JOIN datasource_versions v
                  ON v.datasource_id = d.id AND v.state = 'published'
                WHERE d.archived_at IS NULL
                ORDER BY d.updated_at DESC
                """
            )

        datasources: Dict[UUID, Dict[str, Any]] = {}
        for row in rows:
            datasource_id: UUID = row["id"]
            datasources[datasource_id] = {
                "id": datasource_id,
                "name": row["name"],
                "type": row["type"],
                "status": str(row["status"]),
                "owner_id": row["owner_id"],
                "org_id": row["org_id"],
                "project_id": row["project_id"],
                "tags": list(row["tags"] or []),
                "published_version": row["published_version"],
                "config": row["config_json"],
                "updated_at": row["updated_at"],
            }
        return datasources

    async def sync_from_db(self) -> None:
        datasources = await self.load_active_datasources()
        previous = set(self._datasources.keys())
        self._datasources = datasources

        added = datasources.keys() - previous
        removed = previous - datasources.keys()

        if added:
            logger.info("Discovered %d new datasources: %s", len(added), [str(ds) for ds in added])
        if removed:
            logger.info("%d datasources removed or archived: %s", len(removed), [str(ds) for ds in removed])

        logger.debug("Datasource registry state: %s", {
            str(k): {"name": v["name"], "status": v["status"], "version": v["published_version"]}
            for k, v in datasources.items()
        })
