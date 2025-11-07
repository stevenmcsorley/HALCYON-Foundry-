# Phase 11A — Datasource Studio Infrastructure Execution Plan

## Objective

Establish the backend foundation for Datasource Studio: persistent storage for datasource configurations, registry refactor for dynamic loading, API surface for management/testing, and security primitives (secrets, RBAC, audit). This lays the groundwork for the Studio UI in Phase 11B.

## Scope

1. Database schema & migrations for datasource metadata, versioning, and secrets.
2. GraphQL schema/resolvers for datasources and versions (parity with REST).
3. Registry service refactor to pull configs from DB, manage connector workers, and expose lifecycle/test hooks.
4. Secret handling approach (encrypted storage + integration hooks for external vaults).
5. RBAC/Audit requirements definition and minimal enforcement for Phase 11A (full UI in later sub-phases).

## Deliverables

| Area | Deliverable |
| --- | --- |
| Schema | SQL migrations (Postgres) for `datasources`, `datasource_versions`, `datasource_state`, `datasource_secrets`, `datasource_events`. |
| Registry | Refactored service reading configs from DB, worker lifecycle management, test harness, observability hooks. |
| APIs | REST/GraphQL endpoints for datasource lifecycle actions, status, metrics, and test-run execution. |
| Security | Secret storage module (encrypted columns + optional vault integration hooks), RBAC permission matrix, audit logging spec. |
| Documentation | Architecture diagrams, state machine, API docs, operational runbook. |

## Milestones

### M1 — Schema & Migrations
- Finalize data model (ER diagram) and tagging/version strategy.
- Implement migrations with reversible scripts.
- Seed tooling to import existing YAML datasources into DB (Phase 11C usage).

### M2 — Registry Core Refactor
- Abstract datasource repository (DB-backed) with caching.
- Implement connector worker manager (start/stop/refresh).
- Provide test-run executor (single-shot transform + validation).
- Emit health/metrics per datasource.

### M3 — Gateway API Layer
- REST endpoints (`/datasources`, `/datasources/{id}`, versions, events, lifecycle stubs).
- GraphQL schema additions (types, queries, mutations for datasource & versions).
- Authentication & authorization checks (basic role enforcement).

### M4 — Secrets & Security Foundation
- Secret storage abstraction (encrypted DB column; optional vault adapter).
- RBAC permission matrix (admin/operator/viewer) defined and enforced at API layer.
- Audit log entries for lifecycle actions (create/publish/update/delete/test).

### M5 — Operational Runbook & Instrumentation
- Prometheus metrics (`datasource_ingest_rate`, `datasource_errors_total`, etc.).
- Health checks & readiness endpoints.
- Runbook detailing lifecycle management, migrations, recovery.

## Data Model

Entities:
- `datasources`: id (UUID), name, type, status, org/project (for multi-tenancy), owner, tags, created/updated metadata.
- `datasource_versions`: version id, datasource id, version number, config JSON, state (`draft`, `published`, `archived`), created_by, created_at, comment, approval status.
- `datasource_state`: runtime metadata (current version, status, last_heartbeat, last_event_at, error_code, metrics snapshot).
- `datasource_secrets`: secret id, datasource id, key, encrypted_value, created/rotated metadata.
- `datasource_events`: timestamped events (start, stop, error, publish, rollback, test-run, etc.).

Normalization & indices for fast lookup (by status, owner, type) and time-series partitioning for events.

## Registry Refactor Plan

1. **Config Loader**: Replace YAML loader with repository that fetches active datasources + latest published version. Implement caching and invalidation (poll interval or pub/sub).
2. **Worker Manager**: Child processes/async tasks per datasource; maintain state machine (Starting → Running → Error → Stopped). Support restart, disable, and backfill triggers.
3. **Test Harness**: Endpoint to instantiate connector with provided payload/config (sandboxed) and return transform result + logs.
4. **Metrics**: Expose per-datasource Prometheus metrics and registry-level health.
5. **Hot Reload**: On config change (publish/rollback/disable), gracefully restart affected worker without registry restart.

## API Contract (Draft)

### REST
- `GET /datasources` (filters, pagination).
- `POST /datasources` (create draft).
- `GET /datasources/{id}` (includes current version, state, metrics).
- `PUT /datasources/{id}` (update draft metadata).
- `DELETE /datasources/{id}` (soft delete / archive).
- `POST /datasources/{id}/versions` (create draft version).
- `POST /datasources/{id}/publish` (publish draft → active).
- `POST /datasources/{id}/rollback` (restore previous version).
- `POST /datasources/{id}/test` (run test harness).
- `POST /datasources/{id}/start|stop|restart|backfill` (lifecycle actions).
- `GET /datasources/{id}/events` (history, logs).
- `GET /datasources/{id}/metrics` (current metrics snapshot).

### GraphQL
- Types: `Datasource`, `DatasourceVersion`, `DatasourceState`, `DatasourceMetric`, `DatasourceEvent`.
- Queries: `datasources(filter)`, `datasource(id)`, `datasourceEvents(id)`, `datasourceMetrics(id)`.
- Mutations mirroring REST actions with proper RBAC.

## Security & Compliance Foundation

- **Secrets**: AES-256-GCM encrypted fields with per-tenant key; integrate with environment-provided key or external KMS via adapter.
- **RBAC**: Extend existing JWT roles; mapping (e.g., `datasource:admin`, `datasource:operator`, `datasource:viewer`). Enforced server-side.
- **Audit**: Log structure (actor, action, datasource id, version, timestamp, diff summary) stored in existing audit log channel.
- **Approvals (Phase 11D)**: Not required in 11A but design API hooks for optional approval workflow.

## Dependencies & Integration

- Requires Postgres migrations before registry/gateway deploy.
- Need coordination with Observability (Prometheus, Grafana) for metrics dashboards.
- Align with multi-tenant work (Phase 9) to ensure data model supports org/project scoping.
- Potential integration with existing alerting system for connector failure notifications.

## Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Hot-reload instability | Extensive integration/unit tests, staged rollout, circuit breaker fallback. |
| Secret leakage | Encrypt by default, audit access, never return raw secrets once stored. |
| Migration complexity | Backfill tooling + dry-run mode for importing existing YAML connectors. |
| Performance | Benchmark with load tests (dozens of datasources, high event rate). |
| Scope creep | Strict milestone boundaries (UI/advanced features deferred to 11B+). |

## Next Steps

1. Review & sign off on Phase 11A plan.
2. Begin M1 (schema design & migrations) — draft schema, review, implement migration scripts.
3. Parallel design of registry refactor (component diagram, worker lifecycle).
4. Define GraphQL schema additions; align with UI needs for 11B.
5. Prepare secret handling module skeleton.

