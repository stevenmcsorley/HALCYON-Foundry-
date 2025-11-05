# Changelog

All notable changes to HALCYON Foundry Core will be documented in this file.

## [v4b-ml-case-automation] - 2025-11-05

### Added
- **ML Scoring Engine** - Heuristic-based case priority and owner suggestions
  - Priority scoring based on keyword analysis and severity mapping
  - Owner suggestion based on historical resolution patterns
  - Similar case discovery using Jaccard similarity on titles
  - Model versioning (v1.0.0) for tracking ML model versions
- **Case Insights UI Panel** - ML-generated suggestions display
  - Suggested priority and owner with "Adopt" buttons (analyst/admin only)
  - Related cases chips with navigation
  - ML model version display
- **Adoption API Endpoints** - REST and GraphQL mutations for adopting suggestions
  - `PATCH /cases/{id}/adopt/priority` - Adopt priority suggestion
  - `PATCH /cases/{id}/adopt/owner` - Adopt owner suggestion
  - GraphQL: `adoptPrioritySuggestion`, `adoptOwnerSuggestion`
- **ML Metrics** - Prometheus metrics for ML inference and adoption
  - `ml_inference_total{model, status}` - Inference attempts (success/fail)
  - `ml_suggestion_applied_total{type}` - Adoption count (priority/owner)
  - `ml_inference_latency_seconds{model}` - Latency histogram
  - `ml_model_version_info{model, version}` - Model version gauge
- **Database Schema** - ML suggestion fields added to `cases` table
  - `priority_suggestion` - Suggested priority level
  - `owner_suggestion` - Suggested case owner
  - `similar_case_ids` - JSONB array of related case IDs
  - `ml_version` - ML model version used

### Changed
- Cases list now shows "AI Priority" badge indicator for suggested priorities
- Case creation/update automatically triggers ML suggestion computation
- Frontend store (`casesStore.ts`) includes snake_case to camelCase transformation for ML fields

### Fixed
- API response format now correctly handles ML suggestion fields (snake_case → camelCase)

### Notes
- ML suggestions are heuristic-based (not a trained model)
- Owner suggestions require historical case data
- All ML fields are nullable; safe to disable if needed
- RBAC: Viewer can see Insights (read-only), Analyst/Admin can adopt

## [Phase 2] - 2024-11-04

### Added
- **Redis pub/sub durability** for WebSocket events - Enables horizontal scaling and survives Gateway restarts
- **GraphQL schema validation guardrails** - Startup assertion to catch schema errors early
- **OPA-stubbed role handling** - Role-based access control via `X-Roles` header (Keycloak-ready)
- **Event timeline aggregation** - `/events/counts` endpoint with hour/minute/day buckets and bar chart visualization
- **Interactive MapLibre map panel** - Real-time location markers with click-to-select and smooth flyTo animations
- **Interactive Cytoscape graph panel** - Real-time relationship visualization with node selection and focus centering
- **Global Zustand selection store** - Centralized entity selection state management
- **Focus event bus** - Cross-component communication for map/graph synchronization
- **Entity Inspector drawer** - Side panel with entity attributes and "Focus on Map/Graph" action
- **WebSocket real-time streaming** - Auto-reconnecting client with entity/relationship upsert subscriptions
- **GraphQL `entityById` query** - Single entity retrieval endpoint
- **CORS middleware** - Added to Ontology service for browser access

### Changed
- Gateway mutations now publish to Redis for WebSocket broadcasting
- UI hooks (`useEntities`, `useRelationships`) merge real-time updates into local state
- Timeline panel renders individual bars with proper spacing and width limits

### Fixed
- Map flyTo animation smoothness and duration
- Timeline single-bar width limitation (max 20% for single data point)
- WebSocket connection stability with proper cleanup

---

## [TODO] Phase 3 Planning

- Stream durability enhancements (Redis pub/sub persistence)
- Map & graph selection sync improvements (bidirectional focus)
- Timeline advanced features (time range selection, playback controls)
- Auth integration (Keycloak JWT verification and role extraction)
- Performance optimizations (debouncing, virtual scrolling for large datasets)
- Additional visualizations (relationship filters, entity type legends)


## Phase 3: Observability, Auth Integration, and Playback (2025-01-XX)

### Observability Foundation
- **Structured JSON Logging**: All services now emit structured JSON logs with fields: ts, level, svc, msg, traceId, userId
- **Health Checks**: Added `/health` (liveness) and `/health/ready` (readiness with dependency checks) endpoints to all services
- **Prometheus Metrics**: All services expose `/metrics` endpoints with:
  - HTTP request duration histograms
  - WebSocket connection gauges (Gateway)
  - Entity/relationship upsert counters
  - Policy evaluation duration (Gateway)
- **Prometheus & Grafana**: Added to docker-compose with:
  - Prometheus scrape configuration for all services
  - Grafana datasource provisioning
  - Basic overview dashboard
- **OpenTelemetry Tracing**: Distributed tracing enabled across all services:
  - FastAPI and httpx instrumentation
  - OTLP export to Jaeger
  - Trace context propagation

### Auth Integration (Keycloak OIDC)
- **Keycloak Service**: Added to docker-compose with dev realm (halcyon-dev)
- **Gateway JWT Middleware**: OIDC discovery, JWKS cache, JWT verification
- **Role-Based Access Control**: Roles extracted from token (realm_access, resource_access) and passed to OPA
- **UI Authentication**: 
  - Login/logout functionality with Keycloak OIDC
  - Zustand authStore for state management
  - LoginForm and UserMenu components
  - Route guarding with DEV_MODE fallback for local development
- **GraphQL Context**: Resolvers updated to read roles from context["user"] instead of X-Roles header

### Playback System (Timeline Replay)
- **Event Playback API**: `GET /events/playback` endpoint with time range filtering
- **Point-in-Time Queries**: `GET /graph/at` endpoint for lightweight state snapshots
- **Automatic Timestamps**: Server-generated ISO timestamps added to all entities/relationships during upsert
- **Playback Controls**: 
  - Play/pause, speed control (0.25x to 4x), seek slider
  - Time range selector for setting playback bounds
- **Timeline Integration**: 
  - Visual scrubber with current time indicator (yellow line)
  - Clickable timeline bars for seeking
  - Highlighted bars at cursor position
- **Playback Hook**: Automatic cursor advancement based on playback speed

---

## Phase 4A: Cases & Ownership (2025-11-05)

### Cases Management System
- **Full Triage Pipeline**: Complete Alerts → Cases → Notes → Resolution workflow
- **Cases Workspace**: New Cases tab with list/detail split view for analyst triage
- **Alert-to-Case Linking**: Multi-select alerts and create cases with automatic assignment
- **Case Chips**: Visual indicators on alert rows showing linked case IDs with click-to-navigate
- **Cross-Tab Navigation**: Seamless navigation between Alerts and Cases tabs with case selection

### Backend
- **Database Schema**: 
  - `cases` and `case_notes` tables created
  - `alerts.case_id` foreign key column (nullable, cascade-safe)
  - `case_status` ENUM: open, in_progress, resolved, closed
  - `case_priority` ENUM: low, medium, high, critical
  - 13 supporting indexes for fast triage queries
- **REST API**: 7 endpoints for cases management:
  - `GET /cases` - List cases (filterable by status, priority, owner, search)
  - `POST /cases` - Create new case
  - `GET /cases/{id}` - Retrieve case detail
  - `PATCH /cases/{id}` - Update case metadata
  - `GET /cases/{id}/notes` - List case notes
  - `POST /cases/{id}/notes` - Add note to case
  - `POST /cases/{id}/alerts:assign` - Link alerts to case
- **GraphQL**: Case types and mutations added to schema
- **Metrics**: 
  - `cases_created_total{priority}` - Counter for case creation
  - `cases_resolved_total` - Counter for case resolution
  - `alerts_assigned_to_case_total` - Counter for alert assignments

### Frontend
- **Cases Store**: Zustand store (`casesStore.ts`) with full CRUD operations, notes management, and alert assignment
- **UI Components**:
  - `CasesTab.tsx` - Main workspace layout with list/detail view
  - `CasesList.tsx` - Filterable list view (status, priority, owner, search)
  - `CaseView.tsx` - Case detail composer
  - `CaseMeta.tsx` - Inline editing for status/priority/owner (analyst/admin only)
  - `CaseNotes.tsx` - Threaded notes view with add functionality
  - `CaseAlerts.tsx` - Display linked alerts under case
  - `CaseEditor.tsx` - Modal form for create/update
  - `EmptyCaseHint.tsx` - Friendly empty state
- **AlertList Enhancements**:
  - Multi-select checkboxes for alerts (analyst/admin only)
  - "Open as Case" button with pre-filled title (`[SEVERITY] {message}`)
  - Case chip display (`Case #ID`) on alert rows with click-to-navigate
- **RBAC Integration**:
  - Viewer role: Read-only access to Cases tab
  - Analyst/Admin roles: Full create/edit/assign capabilities
- **Error Handling**: Silent 401/403/404 errors, AlertDialog only for 5xx/network/validation errors
- **UX Improvements**:
  - Toast notifications for success messages (no browser alerts)
  - Consistent dark theme (bg-panel, text-white) across all components
  - Inline hints for validation errors

### Verified
- Backend schema, endpoints, and metrics verified
- Frontend components integrated and wired
- Cross-tab navigation functional
- RBAC enforcement working
- Error handling policy implemented
- Full E2E flow tested (backend + frontend)

---
