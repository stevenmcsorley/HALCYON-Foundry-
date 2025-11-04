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
