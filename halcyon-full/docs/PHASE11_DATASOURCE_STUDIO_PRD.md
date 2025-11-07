# Phase 11 — Datasource Management Studio PRD

## Vision

Provide a first-class, production-grade experience for managing external data feeds powering HALCYON. Analysts and platform admins can create, configure, test, monitor, and evolve data sources entirely from the UI — no YAML edits, container restarts, or developer intervention required.

## Goals

1. **Self-Service Datasource Lifecycle**
   - Catalog existing connectors with health & activity metadata.
   - Creation wizard covering connector type selection, connection/auth details, schema/shape mapping, automated validation.
   - Edit, version, compare, and rollback configurations safely.

2. **Runtime Operations**
   - Live on/off toggles, restart/backfill triggers, throttling controls.
   - Ingest test harness (paste payload, fetch sample, run transform) with immediate feedback.
   - Streaming metrics (rate, errors, latency, lag) and connector-specific logs.

3. **Security & Compliance**
   - Secret management (vault/KMS integration or encrypted storage).
   - Fine-grained RBAC (creator vs operator vs viewer) and full audit log coverage.
   - Change history & approvals for high-risk modifications.

4. **Scalable Architecture**
   - Registry reads connector definitions from the database (not static YAML) and hot-reloads changes.
   - Gateway exposes GraphQL/REST APIs for datasource CRUD, test-run execution, and observability.
   - Pluggable connector catalog (HTTP webhook, REST pull, Kafka, S3 batch, SQL poller, etc.).

## Non-Goals

- Building every imaginable connector upfront; focus on core types (webhooks, polling REST, message bus, batch files) with extension hooks.
- Replacing existing ingestion engines (custom ETL, Spark jobs) — Datasource Studio orchestrates HALCYON-native connectors.
- Full-fledged data modeling studio beyond mapping alerts/entities/relationships into HALCYON’s ontology.

## User Personas & Use Cases

| Persona | Needs |
| --- | --- |
| **Platform Admin** | Add new feed (e.g., CrowdStrike alerts), configure secrets, map fields, schedule ingestion, monitor health. |
| **SOC Analyst** | Verify data arriving, run sample payload to debug missing attributes, request new mapping, receive alerts on connector outages. |
| **Compliance Officer** | Audit who changed ingest rules, ensure secrets are controlled, review metrics for SLA adherence. |

### Primary Workflows

1. **Create a Datasource**
   - Pick template (HTTP webhook, REST poller, Kafka, S3 batch).
   - Enter connection details (URL/topic/bucket etc.), configure auth/secrets.
   - Define schedule/trigger behavior.
   - Map payload fields → HALCYON ontology via visual mapper / JSON editor.
   - Run “Test & Validate” (paste payload or auto-fetch sample) to view transformed output and warnings.
   - Save as draft, review diff, publish to production.

2. **Edit Existing Connector**
   - View current config, history, status.
   - Modify mapping or connection parameters.
   - Run tests (with old/new config side-by-side) and view impact analysis.
   - Submit change — optionally require approval for production.

3. **Monitor & Operate**
   - Dashboard with ingest rate, error rate, lag, last seen event, active/inactive state.
   - Access logs/events to debug failures (network errors, schema mismatch).
   - Trigger restart/backfill; schedule maintenance windows.
   - Configure alert thresholds and notifications.

4. **Audit & Security**
   - View change history (who, what, when) with diffs.
   - Manage access (role-based permissions, ownership delegation).
   - Rotate secrets, enforce expiration, integrate with external secret stores.

## Functional Requirements

### Registry & Backend

1. **Datasource Persistence**
   - `datasources` table storing metadata, status, owner, tags.
   - `datasource_versions` capturing config JSON (connection, mapping, runtime options) with version history.
   - Support draft vs published states, approvals, rollback.

2. **Connector Engine Enhancements**
   - Registry loads configs from DB at startup and watches for changes (polling or event-driven).
   - Connectors operate in isolated workers (per datasource) with health reporting.
   - Test-run endpoint: run mapping/transforms against sample payload without affecting production stream.
   - Backfill job runner (batch ingest) integrated with history tracking.

3. **API Surface**
   - CRUD: Create/Read/Update/Delete (soft delete) datasources, versions, drafts.
   - Actions: publish, rollback, clone, enable/disable, restart, trigger backfill.
   - Observability: metrics (Prometheus), status snapshots, log streaming.
   - Secrets: endpoints to inject/retrieve references (never return raw secrets once stored).

4. **Security & Audit**
   - RBAC integration (admin/operator/viewer roles per datasource, org, or global).
   - Audit log entries for every change/test run/secret rotation.
   - Optionally require approvals for publish (hookable workflow).

### UI / Datasource Studio

1. **Datasource Catalog**
   - Search, filter (status, type, owner, tags).
   - Health badges, ingest stats, last event time.

2. **Details Page**
   - Tabs: Overview (metrics, status, controls), Configuration (current & draft), Mapping, History, Logs, Alerts.
   - Quick actions: enable/disable, restart, open logs, run test.

3. **Creation & Editing Wizard**
   - Step 1: Basics (name, description, tags, owner, role assignments).
   - Step 2: Connector type + endpoint/auth fields with validation.
   - Step 3: Schema/shape mapping editor (drag-and-drop, JSON preview, transformation snippets).
   - Step 4: Test & Validate (payload input, output preview, warnings/errors, metrics).
   - Step 5: Summary & Publish.

4. **Metrics & Logs**
   - Inline charts (ingest/sec, errors/min, latency) from Prometheus.
   - Log viewer (streaming or tail) with filters (level, component, correlation ID).

5. **Change Management**
   - Diffs between versions (visual + JSON).
   - Rollback button, comment threads, approvals (if enabled).

### Connector Coverage (Initial)

1. **HTTP Webhook** (push-based) — configurable request auth, rate limits, signature verification.
2. **HTTP/REST Poller** — scheduled GET/POST, pagination, incremental sync, throttling.
3. **Kafka / Message Queue** — topic subscription, consumer group management.
4. **S3 / Object Storage Batch** — periodic scans of buckets/prefixes, file parsing.
5. **Database Poller (optional stretch)** — read-only JDBC/SQL poll with offset tracking.

Each connector type should define:

- Config schema (UI form + backend validation).
- Sample payload generators (where possible).
- Built-in transforms (JSONPath, JMESPath, custom JS/Python) with sandboxing.

## Non-Functional Requirements

- **Reliability**: Connectors auto-recover, configurable retries, health checks.
- **Performance**: handle dozens of sources ingesting hundreds of events/sec with minimal latency.
- **Scalability**: multi-tenant aware (org/project scoping), future-proof for cloud deployments.
- **Security**: secrets encrypted at rest, TLS enforced, per-tenant isolation, full audit coverage.
- **UX**: responsive layouts, accessibility (WCAG AA), inline help & documentation.

## Deliverables & Milestones

1. **11A – Core Infrastructure**
   - Database schema & migrations.
   - Registry refactor to load configs from DB and expose worker lifecycle controls.
   - Gateway APIs & GraphQL schema for datasources + test-run + metrics.
   - Secret storage mechanism (initially DB with encryption, pluggable for external vault).

2. **11B – Studio UX**
   - Datasource catalog, detail pages, creation/edit wizard.
   - Mapping editor with transform previews.
   - Test harness UI + backend integration.

3. **11C – Operations & Observability**
   - Metrics dashboards, log streaming integration, alert configuration.
   - Backfill/restart controls, auto-retry configuration.
   - Change history, version diffing, publish/rollback flows.

4. **11D – Security & Compliance**
   - RBAC enforcement.
   - Audit log entries, approval workflows (if required).
   - Secret rotation UI.

5. **11E – Connector Library Expansion** (optional stretch)
   - Additional connector templates (SFTP, Salesforce, etc.).
   - Community/contrib mechanism for custom connectors.

## Acceptance Criteria (per milestone)

Detailed acceptance criteria will accompany each sub-phase plan (11A, 11B, etc.). At a minimum, the Studio must allow:

- Creating a new HTTP webhook datasource, mapping payload → alert, testing with sample, publishing, and seeing alerts flow into HALCYON.
- Editing the datasource to add entity enrichment, testing, publishing, and seeing updated data take effect without downtime.
- Monitoring ingest metrics and viewing connector logs.
- Disabling the datasource, verifying ingest stops, and re-enabling successfully.
- Auditing who made changes and when.

## Risks & Mitigations

- **Config/secret management complexity** → start with encrypted DB storage; design pluggable interface for Vault/KMS.
- **Hot-reload stability** → build extensive integration tests; add circuit breakers to avoid crashing registry.
- **UI complexity** → modularize wizard components; reuse Playbook Studio patterns (Zustand stores, diff viewers).
- **Backward compatibility** → migration tools to import existing YAML datasources into DB with verification.
- **Time-to-deliver** → break into clearly scoped sub-phases with demoable increments.

## Next Steps

1. Review and sign off on this PRD.
2. Produce Phase 11A execution plan (schema design, registry refactor tasks, API contracts).
3. Schedule milestones and align with remaining Phase 8–10 priorities if necessary.

