from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from uuid import UUID

from .db import get_pool
from .metrics import (
    datasource_last_sync_timestamp,
    datasource_lifecycle_events_total,
    datasource_test_runs_total,
    datasource_workers_running,
)
from .sdk.base import BaseConnector
from .sdk.http_poller import HttpPollerConnector
from .sdk.kafka_consumer import KafkaConsumerConnector
from .sdk.webhook import WebhookConnector


logger = logging.getLogger("registry.datasources")


@dataclass
class ManagedDatasource:
    datasource_id: UUID
    info: Dict[str, Any]
    connector: Optional[BaseConnector] = None


class DatasourceManager:
    """Datasource worker orchestrator."""

    def __init__(self) -> None:
        self._datasources: Dict[UUID, Dict[str, Any]] = {}
        self._workers: Dict[UUID, ManagedDatasource] = {}
        self._lock = asyncio.Lock()

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
            config = row["config_json"] or {}
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
                "config": config,
                "updated_at": row["updated_at"],
            }
        return datasources

    async def sync_from_db(self) -> None:
        datasources = await self.load_active_datasources()
        async with self._lock:
            previous_ids = set(self._datasources.keys())
            self._datasources = datasources

            added = datasources.keys() - previous_ids
            removed = previous_ids - datasources.keys()

            for datasource_id in removed:
                await self._stop_worker(datasource_id)

            for datasource_id, info in datasources.items():
                if info.get("status") != "active" or not info.get("published_version"):
                    await self._stop_worker(datasource_id)
                    continue

                worker = self._workers.get(datasource_id)
                if not worker:
                    await self._start_worker(datasource_id, info)
                else:
                    # Restart if version changed
                    if worker.info.get("published_version") != info.get("published_version"):
                        await self._restart_worker(datasource_id, info)
                    else:
                        worker.info = info

            if added:
                logger.info("Discovered %d new datasources: %s", len(added), [str(ds) for ds in added])
            if removed:
                logger.info("%d datasources removed or archived: %s", len(removed), [str(ds) for ds in removed])

            self._record_worker_metrics()
            datasource_last_sync_timestamp.set(time.time())

    async def start_datasource(self, datasource_id: UUID) -> Dict[str, Any]:
        async with self._lock:
            info = await self._ensure_datasource_cached(datasource_id)
            if info.get("status") != "active":
                raise ValueError("Datasource is not active")
            if not info.get("published_version"):
                raise ValueError("Datasource has no published version")
            await self._start_worker(datasource_id, info)
            return self._workers[datasource_id].info

    async def stop_datasource(self, datasource_id: UUID) -> bool:
        async with self._lock:
            return await self._stop_worker(datasource_id)

    async def restart_datasource(self, datasource_id: UUID) -> Dict[str, Any]:
        async with self._lock:
            info = await self._ensure_datasource_cached(datasource_id)
            if not info.get("published_version"):
                raise ValueError("Datasource has no published version")
            await self._restart_worker(datasource_id, info)
            return self._workers[datasource_id].info

    async def reload_datasource(self, datasource_id: UUID) -> Dict[str, Any]:
        async with self._lock:
            info = await self._refresh_datasource(datasource_id)
            if info.get("status") != "active" or not info.get("published_version"):
                await self._stop_worker(datasource_id)
                return info
            await self._restart_worker(datasource_id, info)
            return info

    async def get_state(self, datasource_id: UUID) -> Dict[str, Any]:
        async with self._lock:
            info = self._datasources.get(datasource_id)
            worker = self._workers.get(datasource_id)
            return {
                "datasource": info,
                "running": bool(worker and worker.connector and worker.connector.is_running),
            }

    async def test_datasource(
        self,
        datasource_id: UUID,
        *,
        payload: Dict[str, Any],
        version: Optional[int] = None,
        config_override: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        config = config_override
        if config is None:
            config = await self._fetch_version_config(datasource_id, version)
        if not config:
            raise ValueError("No configuration available for datasource")

        connector = self._build_connector(datasource_id, config)
        if connector is None:
            raise ValueError("Unsupported connector type")

        try:
            output = connector.map(payload)
            datasource_test_runs_total.labels(result="success").inc()
            return {
                "success": True,
                "output": output,
                "warnings": [],
                "logs": [],
            }
        except Exception as exc:  # pragma: no cover - mapping errors
            logger.error("Test run failed for %s: %s", datasource_id, exc, exc_info=True)
            datasource_test_runs_total.labels(result="failure").inc()
            return {
                "success": False,
                "output": None,
                "warnings": [],
                "logs": [str(exc)],
            }

    async def _ensure_datasource_cached(self, datasource_id: UUID) -> Dict[str, Any]:
        info = self._datasources.get(datasource_id)
        if info:
            return info
        await self.sync_from_db()
        info = self._datasources.get(datasource_id)
        if not info:
            raise KeyError(f"Datasource {datasource_id} not found")
        return info

    async def _refresh_datasource(self, datasource_id: UUID) -> Dict[str, Any]:
        datasources = await self.load_active_datasources()
        info = datasources.get(datasource_id)
        if not info:
            raise KeyError(f"Datasource {datasource_id} not found")
        self._datasources[datasource_id] = info
        return info

    async def _fetch_version_config(self, datasource_id: UUID, version: Optional[int]) -> Optional[Dict[str, Any]]:
        pool = await get_pool()
        async with pool.acquire() as conn:
            if version is not None:
                row = await conn.fetchrow(
                    """
                    SELECT config_json FROM datasource_versions
                    WHERE datasource_id = $1 AND version = $2
                    """,
                    datasource_id,
                    version,
                )
            else:
                row = await conn.fetchrow(
                    """
                    SELECT config_json FROM datasource_versions
                    WHERE datasource_id = $1 AND state = 'published'
                    ORDER BY version DESC
                    LIMIT 1
                    """,
                    datasource_id,
                )
        if not row:
            return None
        return row["config_json"]

    async def _start_worker(self, datasource_id: UUID, info: Dict[str, Any]) -> None:
        existing = self._workers.get(datasource_id)
        if existing and existing.connector and existing.connector.is_running:
            return

        connector = self._build_connector(datasource_id, info.get("config") or {})
        if connector is None:
            logger.warning("Datasource %s has unsupported connector config", datasource_id)
            await self._update_state(datasource_id, worker_status="error", error_message="Unsupported connector type")
            return

        try:
            await connector.start()
            managed = ManagedDatasource(datasource_id=datasource_id, info=info, connector=connector)
            self._workers[datasource_id] = managed
            await self._update_state(
                datasource_id,
                current_version=info.get("published_version"),
                worker_status="running",
                error_code=None,
                error_message=None,
                last_heartbeat_at=datetime.now(timezone.utc),
            )
            await self._record_event(datasource_id, "start", payload={"version": info.get("published_version")})
        datasource_lifecycle_events_total.labels(event="start").inc()
        self._record_worker_metrics()
        except Exception as exc:
            logger.error("Failed to start datasource %s: %s", datasource_id, exc, exc_info=True)
            await self._update_state(
                datasource_id,
                current_version=info.get("published_version"),
                worker_status="error",
                error_code=type(exc).__name__,
                error_message=str(exc),
            )
        datasource_lifecycle_events_total.labels(event="start_error").inc()
            raise

    async def _stop_worker(self, datasource_id: UUID) -> bool:
        worker = self._workers.get(datasource_id)
        if not worker:
            return False

        connector = worker.connector
        if connector and connector.is_running:
            try:
                await connector.stop()
            except Exception as exc:  # pragma: no cover
                logger.error("Failed to stop datasource %s: %s", datasource_id, exc, exc_info=True)

        self._workers.pop(datasource_id, None)
        await self._update_state(datasource_id, worker_status="stopped")
        await self._record_event(datasource_id, "stop", payload={})
        datasource_lifecycle_events_total.labels(event="stop").inc()
        self._record_worker_metrics()
        return True

    async def _restart_worker(self, datasource_id: UUID, info: Dict[str, Any]) -> None:
        await self._stop_worker(datasource_id)
        await self._start_worker(datasource_id, info)
        datasource_lifecycle_events_total.labels(event="restart").inc()

    def _build_connector(self, datasource_id: UUID, config: Dict[str, Any]) -> Optional[BaseConnector]:
        connector_cfg = config.get("connector", {})
        kind = connector_cfg.get("type")
        connector_id = connector_cfg.get("id") or f"datasource-{datasource_id}"
        mapping = config.get("mapping", {})

        if kind == "webhook":
            payload = {**connector_cfg}
            payload.pop("type", None)
            payload.pop("id", None)
            payload["mapping"] = mapping
            return WebhookConnector(connector_id, payload)
        if kind == "http_poller":
            payload = {**connector_cfg}
            payload.pop("type", None)
            payload.pop("id", None)
            payload["mapping"] = mapping
            return HttpPollerConnector(connector_id, payload)
        if kind == "kafka":
            payload = {**connector_cfg}
            payload.pop("type", None)
            payload.pop("id", None)
            payload["mapping"] = mapping
            return KafkaConsumerConnector(connector_id, payload)

        return None

    async def _update_state(
        self,
        datasource_id: UUID,
        *,
        current_version: Optional[int] = None,
        worker_status: Optional[str] = None,
        last_heartbeat_at: Optional[datetime] = None,
        last_event_at: Optional[datetime] = None,
        error_code: Optional[str] = None,
        error_message: Optional[str] = None,
        metrics_snapshot: Optional[Dict[str, Any]] = None,
    ) -> None:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO datasource_state (
                    datasource_id,
                    current_version,
                )
                VALUES ($1, $2)
                ON CONFLICT (datasource_id)
                DO UPDATE SET
                    current_version = COALESCE(EXCLUDED.current_version, datasource_state.current_version)
                """,
                datasource_id,
                current_version,
            )

            await conn.execute(
                """
                UPDATE datasource_state
                SET worker_status = COALESCE($2, worker_status),
                    last_heartbeat_at = COALESCE($3, last_heartbeat_at),
                    last_event_at = COALESCE($4, last_event_at),
                    error_code = $5,
                    error_message = $6,
                    metrics_snapshot = COALESCE($7::jsonb, metrics_snapshot),
                    updated_at = NOW()
                WHERE datasource_id = $1
                """,
                datasource_id,
                worker_status,
                last_heartbeat_at,
                last_event_at,
                error_code,
                error_message,
                json.dumps(metrics_snapshot) if metrics_snapshot is not None else None,
            )

    async def _record_event(
        self,
        datasource_id: UUID,
        event_type: str,
        *,
        actor: Optional[str] = None,
        payload: Optional[Dict[str, Any]] = None,
        version: Optional[int] = None,
    ) -> None:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO datasource_events (datasource_id, version, event_type, actor, payload)
                VALUES ($1, $2, $3, $4, $5::jsonb)
                """,
                datasource_id,
                version,
                event_type,
                actor,
                json.dumps(payload) if payload is not None else None,
            )

    def _record_worker_metrics(self) -> None:
        running = sum(
            1
            for managed in self._workers.values()
            if managed.connector and managed.connector.is_running
        )
        datasource_workers_running.set(running)


manager = DatasourceManager()
