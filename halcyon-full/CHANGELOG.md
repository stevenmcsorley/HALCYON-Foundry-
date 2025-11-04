# Changelog

All notable changes to HALCYON Foundry Core will be documented in this file.

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

