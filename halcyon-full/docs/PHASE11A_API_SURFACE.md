# Phase 11A — Datasource API Surface

This document defines the REST and GraphQL APIs required for Datasource Studio backend operations. They’ll be implemented across the Registry and Gateway services in Phase 11A.

## API Principles

- **Gateway** exposes authenticated/authorized APIs to UI & external callers.
- **Registry** provides internal management endpoints (called by Gateway) for worker lifecycle and test harness.
- Resource-centric design with clear separation between configuration (datasource & versions), runtime state, and operations.
- All mutating operations audited; RBAC enforced.

## REST API Outline (Gateway)

Base path: `/api/datasources`

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | List datasources with filters (`status`, `type`, `owner`, `org`, `search`). |
| POST | `/` | Create new datasource (initial draft version). |
| GET | `/{id}` | Retrieve datasource details (metadata, current version, state, metrics snapshot). |
| PUT | `/{id}` | Update datasource metadata (name, description, tags, owner, status disable/enable). |
| DELETE | `/{id}` | Archive datasource (soft delete). |
| POST | `/{id}/versions` | Create or update draft version configuration. |
| GET | `/{id}/versions` | List versions (with pagination). |
| GET | `/{id}/versions/{version}` | Get specific version details (config JSON, metadata). |
| POST | `/{id}/publish` | Publish draft version → active (specify version). |
| POST | `/{id}/rollback` | Rollback to previous version. |
| POST | `/{id}/test` | Execute test run with sample payload/config overrides. |
| POST | `/{id}/start` | Request datasource worker start (enable). |
| POST | `/{id}/stop` | Request worker stop (disable). |
| POST | `/{id}/restart` | Restart worker with current config. |
| POST | `/{id}/backfill` | Trigger backfill job (if supported). |
| GET | `/{id}/events` | Fetch audit/operational events. |
| GET | `/{id}/metrics` | Return metrics snapshot (ingest rate, errors, lag, latency). |

### Request/Response Highlights

- **Datasource representation**
  ```json
  {
    "id": "uuid",
    "name": "CrowdStrike Alerts",
    "description": "CS Falcon webhook",
    "type": "webhook",
    "ownerId": "user-123",
    "orgId": "org-1",
    "projectId": "proj-2",
    "status": "active",
    "tags": ["security", "falcon"],
    "createdAt": "2025-11-07T12:00:00Z",
    "updatedAt": "2025-11-07T12:05:00Z",
    "currentVersion": {
      "version": 3,
      "state": "published",
      "createdAt": "2025-11-07T12:04:00Z",
      "createdBy": "alice",
      "summary": "Add hostname mapping"
    },
    "state": {
      "workerStatus": "running",
      "lastHeartbeatAt": "2025-11-07T12:05:30Z",
      "lastEventAt": "2025-11-07T12:05:20Z",
      "errorCode": null,
      "metrics": {
        "ingestRatePerMin": 120,
        "errorRatePerMin": 0,
        "lagSeconds": 5
      }
    }
  }
  ```

- **Version payload**
  ```json
  {
    "version": 4,
    "state": "draft",
    "config": {
      "connector": {
        "type": "webhook",
        "endpoint": "/api/hooks/falcon",
        "auth": {
          "type": "shared_secret",
          "secretRef": "falcon-secret"
        }
      },
      "mapping": {
        "input": "$.alerts[*]",
        "outputs": [
          {
            "kind": "alert",
            "fields": {
              "title": "$.title",
              "severity": "$.severity",
              "entityId": "$.host_id"
            }
          }
        ]
      }
    },
    "summary": "Map host id",
    "createdAt": "...",
    "createdBy": "alice"
  }
  ```

- **Test run request**
  ```json
  {
    "version": 4,
    "payload": { "raw": { ... } },
    "options": {
      "validateOnly": true,
      "timeoutSeconds": 5
    }
  }
  ```

- **Test run response**
  ```json
  {
    "status": "success",
    "outputs": [ { "kind": "alert", "data": { ... } } ],
    "logs": ["Validated payload", "Transformed 1 record"],
    "warnings": [],
    "durationMs": 320
  }
  ```

## Registry Internal API

Internal endpoints (not exposed publicly) for Gateway ↔ Registry communication (can be gRPC/REST). Proposed REST paths:

- `POST /registry/datasources/{id}/reload`
- `POST /registry/datasources/{id}/start`
- `POST /registry/datasources/{id}/stop`
- `POST /registry/datasources/{id}/restart`
- `POST /registry/datasources/{id}/test`
- `POST /registry/datasources/{id}/backfill`
- `GET /registry/datasources/{id}/state`
- `GET /registry/datasources/{id}/metrics`

These endpoints return simple status responses (success/failure + message). Gateway orchestrates and handles RBAC.

## GraphQL Schema (Gateway)

### Types

```graphql
type Datasource {
  id: ID!
  name: String!
  description: String
  type: String!
  ownerId: String
  orgId: ID
  projectId: ID
  status: DatasourceStatus!
  tags: [String!]
  createdAt: DateTime!
  createdBy: String
  updatedAt: DateTime!
  updatedBy: String
  currentVersion: DatasourceVersion
  state: DatasourceState
}

type DatasourceVersion {
  version: Int!
  state: DatasourceVersionState!
  config: JSON!
  summary: String
  createdAt: DateTime!
  createdBy: String
  approvedAt: DateTime
  approvedBy: String
}

type DatasourceState {
  workerStatus: WorkerStatus!
  lastHeartbeatAt: DateTime
  lastEventAt: DateTime
  errorCode: String
  errorMessage: String
  metrics: DatasourceMetrics
}

type DatasourceMetrics {
  ingestRatePerMin: Float
  errorRatePerMin: Float
  lagSeconds: Float
  latencyP95Ms: Float
}

type DatasourceEvent {
  id: ID!
  datasourceId: ID!
  version: Int
  eventType: DatasourceEventType!
  actor: String
  payload: JSON
  createdAt: DateTime!
}
```

### Queries

```graphql
type Query {
  datasources(filter: DatasourceFilter, first: Int, after: String): DatasourceConnection!
  datasource(id: ID!): Datasource
  datasourceVersions(id: ID!, first: Int, after: String): DatasourceVersionConnection!
  datasourceEvents(id: ID!, first: Int, after: String, eventTypes: [DatasourceEventType!]): DatasourceEventConnection!
}
```

### Mutations

```graphql
type Mutation {
  createDatasource(input: CreateDatasourceInput!): Datasource!
  updateDatasource(id: ID!, input: UpdateDatasourceInput!): Datasource!
  archiveDatasource(id: ID!): Boolean!

  createDatasourceVersion(id: ID!, input: CreateDatasourceVersionInput!): DatasourceVersion!
  publishDatasourceVersion(id: ID!, version: Int!, comment: String): Datasource!
  rollbackDatasource(id: ID!, targetVersion: Int!, comment: String): Datasource!

  testDatasource(id: ID!, input: TestDatasourceInput!): DatasourceTestResult!
  startDatasource(id: ID!): Datasource!
  stopDatasource(id: ID!): Datasource!
  restartDatasource(id: ID!): Datasource!
  triggerDatasourceBackfill(id: ID!, input: BackfillInput): Datasource!
}
```

Input types include validation (e.g., mapping JSON). `DatasourceTestResult` contains outputs/logs/warnings.

## RBAC Considerations

- Roles: `datasource:admin`, `datasource:operator`, `datasource:viewer` (mapped from JWT claims).
- Permissions (summary):
  - Admin: full CRUD, publish, delete, secret management.
  - Operator: manage lifecycle (start/stop/restart/backfill/test), view configs, edit drafts.
  - Viewer: read-only (catalog, metrics, events).
- Org/project scoping applied to queries/mutations (only access datasources within authorized org/project).

## Audit Logging

Every mutation (create/update/publish/test/etc.) emits an audit record with:
- Actor (user id).
- Action (string).
- Datasource id + version (if applicable).
- Payload diff summary.
- Timestamp.

Stored in existing audit infrastructure + appended to `datasource_events`.

## Error Handling

- Standardized error codes/messages (e.g., `DS-001` missing secret, `DS-101` invalid config, `DS-201` worker start failure).
- Test runs return structured warnings and errors (validation issues, transformation failures).

## Implementation Notes

- Gateway service orchestrates operations and caches datasource metadata (with invalidation on change).
- Registry endpoints require shared secret / internal auth between gateway & registry.
- Test run requests include `version` and optional override config; registry executes using draft config if provided.
- Metrics endpoint may proxy Prometheus data or provide snapshot from `datasource_state.metrics_snapshot`.

## Next Steps

1. Convert this contract into API definitions (FastAPI routes, GraphQL schema updates).
2. Stub registry endpoints and update Gateway resolvers to bridge to registry.
3. Implement RBAC middleware checks based on new roles.
4. Ensure test harness invocation path is secure and sandboxed.
5. Document API usage for UI team (Phase 11B).

