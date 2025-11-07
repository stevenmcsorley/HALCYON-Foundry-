# Phase 11A — Registry Refactor Plan

## Goals

1. Load datasource configurations from Postgres (not static YAML).
2. Manage connector workers dynamically (start, stop, restart, reload) based on DB state.
3. Provide test harness for validating transforms without affecting live ingest.
4. Emit metrics, health, and events for observability.

## Architecture Overview

```
┌────────────────┐     ┌──────────────────────────┐
│ Postgres (DB)  │◄────│ Registry Repository Layer │
└────────────────┘     └────────────┬─────────────┘
                                      │
                                      ▼
                           ┌─────────────────────┐
                           │ Worker Manager      │
                           │  - lifecycle FSM    │
                           │  - worker registry  │
                           └────────┬────────────┘
                                    │
             ┌──────────────────────┼──────────────────────┐
             ▼                      ▼                      ▼
   ┌────────────────┐     ┌────────────────┐     ┌────────────────┐
   │ Connector Wkr │ ... │ Connector Wkr │ ... │ Connector Wkr │
   └────────────────┘     └────────────────┘     └────────────────┘

Test Harness Layer → instantiates connector execution in sandbox for single-run tests.

Observability Layer → collects metrics/logs/events from workers.
```

## Components

### 1. Repository Layer

- Interfaces to fetch active datasources, versions, secrets.
- Caching with TTL or change notification (poll or LISTEN/NOTIFY) to reduce DB load.
- Methods:
  - `list_active_datasources()`
  - `get_datasource_config(id)` → includes latest published version & secrets (plaintext decrypted only in registry process).
  - `update_state(id, status, heartbeat, metrics)`
  - `record_event(id, type, payload)`

### 2. Worker Manager

- Maintains registry of running connector workers keyed by datasource id.
- State machine per datasource: `INIT → STARTING → RUNNING → ERROR → STOPPED`.
- Periodic sync loop:
  1. Fetch active datasources.
  2. Compare with current workers.
     - New datasource: start worker.
     - Config change (version bump): restart worker with new config.
     - Disabled datasource: stop worker gracefully.
  3. Update `datasource_state` table with status, heartbeats.
- Graceful shutdown/restart using cooperative cancellation (async tasks or subprocess workers).

### 3. Connector Worker

- Abstraction for connector types (webhook, poller, kafka, etc.).
- Receives config (connection params + mapping) and secrets.
- Responsibilities:
  - Process incoming data (pull/push) and emit to ontology/gateway pipeline.
  - Report health via callbacks (heartbeat, error reporting).
  - Expose metrics (rate, latency, errors).

Implementation detail: Workers can be async tasks running in registry process or separate processes (if needed for isolation). Start with async tasks + concurrency controls.

### 4. Test Harness

- API to execute connector logic once with provided payload.
- Workflow:
  1. Fetch draft config (including mapping transforms).
  2. Instantiate connector in “test mode” (no network side effects unless required).
  3. Provide sample payload or run sample fetch.
  4. Return transformed output + logs/metrics/warnings.
- Sandbox: limit runtime (timeout), guard network access if necessary.

### 5. Observability

- Metrics per datasource: ingest rate, error count, lag, last event delay.
- Worker manager exposes Prometheus metrics (via existing `/metrics` endpoint).
- Log streaming: workers log to structured logger; events recorded in `datasource_events`.

## Lifecycle Actions

| Action | Description |
| --- | --- |
| Start | Create worker if not running. |
| Stop | Gracefully cancel worker and mark state. |
| Restart | Stop + start with current config. |
| Reload | Trigger config sync (used after publish). |
| Test | Invoke test harness. |
| Backfill | Trigger batch job (future extension). |

These actions exposed via registry API and gateway.

## Synchronization Strategy

- Polling loop (e.g., every 5s) or event-driven trigger (listen to `datasource_events`). Start with polling + manual reload endpoint.
- On publish/rollback via API, the service issues a `POST /registry/reload/{id}` to prompt immediate reload.
- Worker manager ensures idempotent operations (starting an already running worker is a no-op).

## Error Handling

- Worker failure: capture exception, update `datasource_state.worker_status = 'error'`, record event, optionally auto-restart with backoff.
- Config loading errors: flag datasource as `error` with message; keep previous worker running until new config validated (if already active).
- Secrets missing/invalid: mark error, do not start worker.

## Testing Strategy

- Unit tests for repository and worker manager state transitions.
- Integration tests with fake connectors (mock data sources) to ensure start/stop/reload/test-run behavior.
- Load tests simulating dozens of connectors.

## Rollout Plan

1. Implement new registry in feature flag mode (ability to switch between YAML and DB config for transition).
2. Deploy to staging environment; run YAML → DB import script and validate connectors.
3. Switch production registry to DB-backed mode after validation.
4. Remove legacy YAML loader once stable.

## Dependencies

- Schema migrations (Phase 11A M1) completed.
- Secret encryption module available.
- Gateway API for publish/test ready to call registry.

## Open Items

- Determine concurrency model (threads vs async tasks) per connector type.
- Define connector plugin interface (common base class, entry points).
- Evaluate need for message bus (pub/sub) for change notifications long term.

