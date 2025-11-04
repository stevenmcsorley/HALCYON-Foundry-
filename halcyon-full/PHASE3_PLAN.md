# HALCYON Foundry Core — Phase 3 Implementation Plan

## Overview
Extend the platform with time-based data playback, production-ready authentication, and comprehensive observability while maintaining modularity and adherence to STYLEGUIDE.md principles.

---

## Phase 3.1: Playback System

### Goals
- Implement time-based event replay functionality
- Support temporal navigation (play, pause, rewind, fast-forward)
- Visualize historical state changes over time
- Enable event stream playback at configurable speeds

### Implementation Steps

#### Backend (Ontology Service)

1. **Add playback endpoints**
   ```
   core/ontology/app/routes.py
   ```
   - `GET /events/playback` — stream events by timestamp range
   - Query parameters: `start_ts`, `end_ts`, `speed` (1x, 2x, 10x, etc.)
   - Returns ordered events with timestamps

2. **Add temporal query support**
   ```
   core/ontology/app/store.py
   ```
   - Query entities/relationships as they existed at a specific timestamp
   - Support "point-in-time" graph state queries
   - Index timestamps for efficient temporal lookups

3. **Event store enhancements**
   - Ensure all mutations include timestamp metadata
   - Maintain event log for replay capability
   - Optional: Store snapshots at intervals for faster playback

#### Frontend (UI Console)

4. **Create playback controls component**
   ```
   ui/src/components/
     ├── PlaybackControls.tsx    # Play/pause/speed/time controls
     └── TimeRangeSelector.tsx   # Start/end timestamp picker
   ```

5. **Add playback state management**
   ```
   ui/src/store/
     └── playbackStore.ts        # Zustand store for playback state
   ```

6. **Implement playback timeline**
   - Extend existing Timeline panel with playback integration
   - Visual scrubber for temporal navigation
   - Highlight current playback position

7. **Update visualization panels**
   - Map, Graph, List panels react to playback time cursor
   - Show/hide entities based on temporal state
   - Animate state transitions during playback

8. **WebSocket playback stream**
   ```
   ui/src/services/websocket.ts
   ```
   - Add playback-specific WebSocket channel
   - Stream events at configured playback speed
   - Support pause/resume/seek commands

---

## Phase 3.2: Auth Integration (Keycloak OIDC)

### Goals
- Replace auth stub with Keycloak OIDC integration
- Support role-based access control (RBAC)
- Pass authenticated user context to OPA for policy evaluation
- Secure Gateway endpoints with JWT validation

### Implementation Steps

#### Keycloak Setup

1. **Add Keycloak service to docker-compose**
   ```
   deploy/docker-compose.yml
   ```
   - Add Keycloak container with dev realm
   - Configure test users and roles (analyst, viewer, admin)
   - Expose Keycloak admin and public endpoints

2. **Create Keycloak realm configuration**
   ```
   deploy/keycloak/
     ├── realm-export.json       # Dev realm with roles/clients
     └── init.sh                 # Realm import script
   ```

#### Gateway Integration

3. **Add OIDC client library**
   ```
   core/gateway/pyproject.toml
   ```
   - Add `python-jose[cryptography]` for JWT validation
   - Add `httpx` (already present) for OIDC discovery

4. **Implement JWT validation middleware**
   ```
   core/gateway/app/
     ├── auth.py                 # OIDC client and JWT validation
     └── middleware.py           # Auth middleware for FastAPI
   ```

5. **Update Gateway config**
   ```
   core/gateway/app/config.py
   ```
   - Add `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`
   - Add `JWT_ALGORITHM`, `OIDC_DISCOVERY_URL`

6. **Extract roles from JWT**
   - Parse `realm_access.roles` or `resource_access.{client}.roles`
   - Fall back to `default_roles` if no roles present
   - Pass roles to OPA policy evaluation

7. **Update resolvers**
   ```
   core/gateway/app/resolvers.py
   ```
   - Remove `default_roles` fallback (use JWT roles)
   - Extract roles from `info.context["user"]` instead of headers
   - Maintain backward compatibility for dev mode (optional)

8. **Add auth endpoints**
   - `POST /auth/login` — initiate OIDC flow (redirect to Keycloak)
   - `GET /auth/callback` — handle OIDC callback
   - `POST /auth/logout` — invalidate session
   - `GET /auth/user` — return current user info

#### Frontend Integration

9. **Create auth service**
   ```
   ui/src/services/
     ├── auth.ts                 # OIDC client wrapper
     └── http.ts                 # Axios/fetch wrapper with token injection
   ```

10. **Add auth state management**
    ```
    ui/src/store/
      └── authStore.ts           # Zustand store for auth state
    ```

11. **Create login/logout components**
    ```
    ui/src/components/
      ├── LoginForm.tsx          # Login UI
      └── UserMenu.tsx           # User dropdown with logout
    ```

12. **Protect routes**
    ```
    ui/src/App.tsx
    ```
    - Add route guards for authenticated routes
    - Redirect to login if not authenticated
    - Handle token refresh

13. **Update API client**
    ```
    ui/src/services/api.ts
    ```
    - Inject `Authorization: Bearer {token}` header
    - Handle 401 responses (redirect to login)
    - Implement token refresh logic

---

## Phase 3.3: Observability

### Goals
- Implement comprehensive logging across all services
- Add structured metrics collection (Prometheus)
- Enable distributed tracing (OpenTelemetry)
- Provide health check endpoints
- Create observability dashboard

### Implementation Steps

#### Structured Logging

1. **Standardize logging format**
   ```
   core/*/app/
     └── logging.py              # Shared logging configuration
   ```
   - Use structured JSON logging
   - Include service name, trace ID, user context
   - Configure log levels via environment

2. **Add request logging middleware**
   - Log all HTTP requests/responses
   - Include request ID, duration, status code
   - Log GraphQL queries (sanitize sensitive data)

3. **Add application logs**
   - Log entity upserts, policy decisions, errors
   - Include relevant context (entity ID, user, timestamp)

#### Metrics (Prometheus)

4. **Add Prometheus client libraries**
   ```
   core/*/pyproject.toml
   ```
   - Add `prometheus-client` to each service

5. **Define metrics**
   ```
   core/*/app/
     └── metrics.py              # Prometheus metrics definitions
   ```
   - Request duration histograms
   - Entity/relationship upsert counters
   - WebSocket connection gauges
   - Error rate counters
   - Policy evaluation duration

6. **Expose metrics endpoints**
   ```
   core/*/app/main.py
   ```
   - Add `GET /metrics` endpoint to each service
   - Return Prometheus format metrics

7. **Add Prometheus to docker-compose**
   ```
   deploy/docker-compose.yml
   ```
   - Add Prometheus service
   - Configure scrape targets for all services
   - Persistent volume for metrics storage

#### Distributed Tracing (OpenTelemetry)

8. **Add OpenTelemetry libraries**
   ```
   core/*/pyproject.toml
   ```
   - Add `opentelemetry-api`, `opentelemetry-sdk`
   - Add instrumentors: `opentelemetry-instrumentation-fastapi`, `opentelemetry-instrumentation-httpx`

9. **Configure tracing**
   ```
   core/*/app/
     └── tracing.py              # OpenTelemetry setup
   ```
   - Initialize tracer with service name
   - Export traces to Jaeger/OTLP collector
   - Add trace context propagation

10. **Add Jaeger/OTLP to docker-compose**
    ```
    deploy/docker-compose.yml
    ```
    - Add Jaeger or OTLP collector service
    - Configure trace export from all services

#### Health Checks

11. **Implement health check endpoints**
    ```
    core/*/app/routes.py
    ```
    - `GET /health` — basic liveness check
    - `GET /health/ready` — readiness check (database connections, etc.)
    - Return JSON: `{ "status": "ok|degraded|down", "checks": {...} }`

12. **Add dependency health checks**
    - Ontology: Check Postgres and Neo4j connectivity
    - Gateway: Check Ontology and OPA connectivity
    - UI: Check Gateway connectivity (optional client-side)

#### Observability Dashboard

13. **Add Grafana to docker-compose**
    ```
    deploy/docker-compose.yml
    ```
    - Add Grafana service
    - Configure Prometheus data source
    - Pre-configure dashboards for services

14. **Create dashboard configurations**
    ```
    deploy/grafana/
      ├── dashboards/
      │   ├── gateway.json       # Gateway metrics dashboard
      │   ├── ontology.json      # Ontology metrics dashboard
      │   └── overview.json      # System overview
      └── datasources/
          └── prometheus.yml     # Prometheus data source config
    ```

15. **Add UI observability panel (optional)**
    ```
    ui/src/modules/
      └── observability/
          ├── MetricsPanel.tsx   # Show key metrics in UI
          └── index.tsx
    ```

---

## Implementation Order (Recommended)

1. **Phase 3.3: Observability** (Foundation for debugging and monitoring)
   - Start with structured logging
   - Add health checks
   - Implement metrics
   - Add tracing last

2. **Phase 3.2: Auth Integration** (Security foundation)
   - Keycloak setup
   - Gateway JWT validation
   - Frontend auth flow
   - Role-based access

3. **Phase 3.1: Playback System** (Feature enhancement)
   - Backend temporal queries
   - Playback controls
   - UI integration

---

## Testing Strategy

1. **Auth Integration**
   - Test login/logout flows
   - Verify JWT validation and role extraction
   - Test OPA policy evaluation with real roles
   - Test protected endpoints

2. **Playback System**
   - Test temporal queries with seed data
   - Verify playback speed controls
   - Test seek/scrub functionality
   - Validate state transitions

3. **Observability**
   - Verify metrics are collected correctly
   - Test distributed tracing across services
   - Validate health check responses
   - Confirm logs include necessary context

---

## Files to Create/Modify

### New Files
```
core/gateway/app/auth.py
core/gateway/app/middleware.py
core/ontology/app/routes.py (playback endpoints)
ui/src/components/PlaybackControls.tsx
ui/src/components/TimeRangeSelector.tsx
ui/src/components/LoginForm.tsx
ui/src/components/UserMenu.tsx
ui/src/services/auth.ts
ui/src/services/http.ts
ui/src/store/authStore.ts
ui/src/store/playbackStore.ts
deploy/keycloak/realm-export.json
deploy/keycloak/init.sh
deploy/grafana/dashboards/*.json
deploy/grafana/datasources/prometheus.yml
```

### Modified Files
```
deploy/docker-compose.yml
core/gateway/app/config.py
core/gateway/app/main.py
core/gateway/app/resolvers.py
core/gateway/pyproject.toml
core/ontology/app/store.py
core/ontology/pyproject.toml
ui/src/App.tsx
ui/src/services/api.ts
ui/src/modules/timeline/index.tsx
```

---

## Notes

- Keep playback system lightweight; avoid storing full event history if not needed
- Auth integration should maintain dev-mode fallback for local development
- Observability should be non-intrusive; use sampling for high-volume traces
- Follow STYLEGUIDE.md principles for all new code
- Ensure backward compatibility where possible
