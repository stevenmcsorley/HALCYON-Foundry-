# Phase 2 Guardrails & Best Practices

## GraphQL Schema Management

### Single Source of Truth
- **Keep `schema.graphql` as the only SDL file** (or a clearly composed set)
- Avoid mixing inline SDL strings in resolvers
- All type definitions should be in the `.graphql` file

### Schema Composition
- If splitting SDL, import with one loader: `load_schema_from_path("app/schema.graphql")`
- Compose via `make_executable_schema(type_defs, [...resolvers])` once
- Do not duplicate type definitions across files

### Resolver Organization
- Export resolvers in separate files
- Merge them into a single `query`, `mutation` map before passing to `make_executable_schema`
- Example: `from .resolvers import query, mutation`

### Startup Assertion
- Added startup event handler that validates GraphQL schema on boot
- Executes a trivial query (`{ health }`) to ensure schema is valid
- Logs fatal error and fails fast if schema validation fails
- Prevents silent failures where WebSocket mounts fail due to invalid schemas

### Hot Reload Gotcha
- **Always restart Gateway after SDL edits** when using hot-reload
- Ariadne can cache merged schemas
- Use `docker compose restart gateway` or rebuild container after schema changes

## Code Quality

### Import Organization
- Group imports: stdlib, third-party, local
- Use explicit imports: `from fastapi import FastAPI, WebSocket, WebSocketDisconnect`
- Avoid wildcard imports

### Error Handling
- Use `logging.critical()` for fatal errors that should stop the service
- Use `logging.error()` for recoverable errors
- Use `logging.warning()` for non-critical issues
- Always log context: include error details, entity IDs, etc.

### Type Safety
- Use strict typing (per STYLEGUIDE.md)
- Avoid `any` types
- Use proper type hints for all function parameters and return values

## Testing & Validation

### Schema Validation
- Schema is validated on startup (see startup assertion above)
- Any duplicate type/field definitions will cause startup to fail
- This prevents silent WebSocket mount failures

### Health Checks
- All services expose `/healthz` endpoint
- Gateway validates GraphQL schema via health query on startup
- Use health endpoints for monitoring and readiness probes

## Deployment Notes

### Container Rebuild
- After schema changes: rebuild container, don't just restart
- Command: `docker compose build gateway && docker compose up -d gateway`
- Hot-reload may not pick up `.graphql` file changes

### WebSocket Route Registration
- WebSocket routes must be defined before ASGI mounts
- Use explicit route definitions: `@app.websocket("/ws")`
- Verify route registration: check logs for "APIWebSocketRoute: /ws"

## Future Improvements

See PHASE2_PLAN.md for suggested next steps:
1. Stream durability with Redis pub/sub or NATS
2. Map & graph selection sync (pan/zoom to selected entity)
3. Timeline counts aggregation
4. Auth stub with Keycloak for role-based redaction demo
