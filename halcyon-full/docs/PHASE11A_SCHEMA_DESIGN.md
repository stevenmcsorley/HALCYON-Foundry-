# Phase 11A — Datasource Persistence Schema Design

## Overview

This document defines the relational data model for Datasource Studio. It supports configuration versioning, runtime state, secret management, and event history. Implemented in Postgres via migrations in Phase 11A.

## Entities & Relationships

```
datasources (1) —— (N) datasource_versions
             \—— (1) datasource_state
             \—— (N) datasource_secrets
             \—— (N) datasource_events
```

### 1. `datasources`

Core metadata about each datasource.

| Column | Type | Notes |
| --- | --- | --- |
| id | UUID (PK) | Stable identifier. |
| name | TEXT | Unique per owner/tenant; human-readable. |
| description | TEXT | Optional summary. |
| type | TEXT | Connector type (`webhook`, `rest_poller`, `kafka`, etc.). |
| owner_id | TEXT | User or service account identifier. |
| org_id | UUID | Optional (for multi-tenant scoping). |
| project_id | UUID | Optional sub-scope. |
| tags | TEXT[] | Free-form tagging. |
| status | TEXT | `active`, `disabled`, `error`, `draft`. |
| created_at | TIMESTAMPTZ | |
| created_by | TEXT | |
| updated_at | TIMESTAMPTZ | |
| updated_by | TEXT | |
| archived_at | TIMESTAMPTZ | Soft delete. |

Indexes:
- `(owner_id, status)`
- `(org_id, project_id)`
- `(tags)` GIN for search.

### 2. `datasource_versions`

Immutable configuration versions.

| Column | Type | Notes |
| --- | --- | --- |
| id | UUID (PK) |
| datasource_id | UUID (FK → datasources.id) |
| version | INT | Monotonic per datasource. |
| state | TEXT | `draft`, `published`, `archived`. |
| config_json | JSONB | Connection + mapping config. |
| summary | TEXT | Change summary/comment. |
| created_at | TIMESTAMPTZ |
| created_by | TEXT |
| approved_at | TIMESTAMPTZ | Optional approval timestamp. |
| approved_by | TEXT |

Constraints:
- Unique `(datasource_id, version)`.
- Only one `state = 'published'` per datasource (enforced via trigger or application logic).

### 3. `datasource_state`

Runtime metadata (one row per datasource).

| Column | Type | Notes |
| --- | --- | --- |
| datasource_id | UUID (PK/FK) |
| current_version | INT | Reference to latest applied version. |
| worker_status | TEXT | `starting`, `running`, `stopped`, `error`. |
| last_heartbeat_at | TIMESTAMPTZ |
| last_event_at | TIMESTAMPTZ | Timestamp of last ingested record. |
| error_code | TEXT | Latest error identifier. |
| error_message | TEXT | Optional detail (truncate to 2KB). |
| metrics_snapshot | JSONB | Cached metrics (ingest rate, error rate, lag). |
| updated_at | TIMESTAMPTZ |

### 4. `datasource_secrets`

Secrets associated with datasource configurations.

| Column | Type | Notes |
| --- | --- | --- |
| id | UUID (PK) |
| datasource_id | UUID (FK) |
| key | TEXT | Identifier (e.g., `api_key`, `client_secret`). |
| encrypted_value | BYTEA | Ciphertext (AES-GCM or integration-specific). |
| version | INT | For rotation; increments on change. |
| created_at | TIMESTAMPTZ |
| created_by | TEXT |
| rotated_at | TIMESTAMPTZ |
| rotated_by | TEXT |

Indexes:
- `(datasource_id, key)` unique.

### 5. `datasource_events`

Audit and runtime events (append-only).

| Column | Type |
| --- | --- |
| id | BIGSERIAL |
| datasource_id | UUID |
| version | INT | Associated version (if applicable). |
| event_type | TEXT | `create`, `publish`, `rollback`, `test_run`, `worker_error`, etc. |
| actor | TEXT | User/service performing the action. |
| payload | JSONB | Additional metadata (diff summary, error info). |
| created_at | TIMESTAMPTZ |

Partition strategy (optional): range partition by month or use TimescaleDB.

## Migrations Outline

1. Create tables in order: `datasources`, `datasource_versions`, `datasource_state`, `datasource_secrets`, `datasource_events`.
2. Add indices & constraints, triggers if required (e.g., enforce single published version).
3. Seed script layout for future YAML → DB importer (deferred to Phase 11C).

## Data Access Layer

Implement repository interfaces in the registry/gateway for:
- Fetching datasource list/filter.
- Reading latest published version or draft by ID.
- Creating new versions, publishing, rolling back within transactions.
- Updating runtime state (heartbeat, metrics, errors).
- Storing/retrieving secrets (enforced to never return plaintext once stored).
- Recording events/audit entries.

## Open Questions

- Secret storage integration: start with encrypted column; design for pluggable adapters (AWS KMS, Hashi Vault).
- Approval workflow: store approval metadata in `datasource_versions` (fields provided); actual process in Phase 11D.
- Multi-tenant scoping: ensure `org_id`/`project_id` used for RBAC filters (Phase 9 integration).

## Next Steps (Phase 11A)

1. Produce SQL migration scripts matching this schema (`migrations/019_datasource_schema.sql` etc.).
2. Review with team for adjustments (additional fields, indexing).
3. Update registry/gateway code to use repository layer.

