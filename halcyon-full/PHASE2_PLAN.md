# HALCYON Foundry Core — Phase 2 Implementation Plan

## Overview
Extend the working baseline with interactive visualizations, real-time streaming, and enhanced data exploration capabilities while maintaining modularity and adherence to STYLEGUIDE.md principles.

---

## Phase 2.1: MapLibre Map Panel

### Goals
- Replace map placeholder with live MapLibre map
- Display Location entities as markers using lat/lon from attrs
- Support click interactions for entity selection

### Dependencies
```bash
npm install maplibre-gl @types/maplibre-gl
```

### Implementation Steps

1. **Add MapLibre dependencies**
   - Update `ui/package.json` with maplibre-gl
   - Add MapLibre CSS import

2. **Create Map components** (following STYLEGUIDE.md)
   ```
   ui/src/modules/map/
     ├── MapPanel.tsx          # Main panel component
     ├── MapCanvas.tsx         # MapLibre wrapper component
     ├── MapMarker.tsx         # Individual marker component
     ├── useMapData.ts         # Hook to filter Location entities
     └── index.ts              # Export
   ```

3. **Create `useMapData` hook**
   - Filter entities where `type === "Location"`
   - Extract `lat` and `lon` from `attrs`
   - Return formatted data: `{ id, type, lat, lon, attrs, name? }`

4. **Implement `MapCanvas` component**
   - Initialize MapLibre map with dark theme
   - Use Tailwind semantic tokens for styling
   - Handle map initialization and cleanup
   - Support marker rendering from Location entities

5. **Update `MapPanel.tsx`**
   - Use `useEntities()` and `useMapData()` hooks
   - Integrate `MapCanvas` with Location data
   - Handle loading/error states
   - Pass click handlers for entity selection (prep for inspector)

6. **Styling**
   - Use existing Tailwind theme (surface, panel, accent colors)
   - Ensure map fits within Card component
   - Match existing UI aesthetic

---

## Phase 2.2: Cytoscape.js Graph Visualization

### Goals
- Render graph relationships visually using Cytoscape.js
- Display entities as nodes and relationships as edges
- Support interactive node/edge selection

### Dependencies
```bash
npm install cytoscape @types/cytoscape
```

### Implementation Steps

1. **Add Cytoscape dependencies**
   - Update `ui/package.json`

2. **Create Graph components**
   ```
   ui/src/modules/graph/
     ├── GraphPanel.tsx        # Main panel (existing, update)
     ├── GraphCanvas.tsx       # Cytoscape wrapper component
     ├── useGraphData.ts       # Hook to transform entities+relationships to Cytoscape format
     └── index.ts              # Export
   ```

3. **Create `useGraphData` hook**
   - Combine `useEntities()` and `useRelationships()`
   - Transform to Cytoscape format:
     ```typescript
     {
       nodes: [{ data: { id, label, type, attrs } }],
       edges: [{ data: { id, source: fromId, target: toId, label: type } }]
     }
     ```

4. **Implement `GraphCanvas` component**
   - Initialize Cytoscape with layout (e.g., `breadthfirst`, `cose`)
   - Apply dark theme styling
   - Handle node/edge click events
   - Support pan/zoom
   - Style nodes by entity type (use semantic colors)

5. **Update `GraphPanel.tsx`**
   - Use `useGraphData()` hook
   - Integrate `GraphCanvas`
   - Handle loading/error states
   - Pass selection handlers (prep for inspector)

---

## Phase 2.3: WebSocket Real-time Streaming

### Goals
- Implement WebSocket endpoint in Gateway for real-time entity updates
- Stream entity upserts to connected clients
- Update UI panels reactively on new data

### Implementation Steps

#### Gateway Backend (Python/FastAPI)

1. **Add WebSocket support to Gateway**
   - Install dependency: `websockets` or use FastAPI WebSocket
   - Add WebSocket endpoint: `/ws/entities`
   - Maintain connection manager for client subscriptions

2. **Create WebSocket handler**
   ```
   core/gateway/app/
     ├── websocket.py           # WebSocket connection manager
     └── routes.py              # WebSocket route (or add to main.py)
   ```

3. **Implement broadcast mechanism**
   - On entity upsert (via GraphQL mutation), broadcast to all connected clients
   - Message format: `{ type: "entity_upserted", payload: Entity }`
   - Handle connection lifecycle (connect, disconnect, heartbeat)

4. **Update resolvers**
   - After successful `upsertEntities`, broadcast to WebSocket clients
   - Similar for `upsertRelationships`

5. **Add WebSocket to docker-compose**
   - Ensure CORS allows WebSocket upgrade
   - Update Gateway service configuration

#### Frontend (React/TypeScript)

6. **Create WebSocket service**
   ```
   ui/src/services/
     └── websocket.ts           # WebSocket client wrapper
   ```

7. **Create `useEntityStream` hook**
   ```
   ui/src/hooks/
     └── useEntityStream.ts     # Hook to subscribe to entity updates
   ```

8. **Integrate streaming in panels**
   - Update `ListPanel`, `MapPanel`, `GraphPanel` to use `useEntityStream()`
   - Merge real-time updates with existing data
   - Handle reconnection logic

---

## Phase 2.4: Enhanced Read-model API

### Goals
- Add GraphQL subscriptions (if needed, or enhance queries)
- Add entity-by-ID query
- Add relationship filtering by type/entity

### Implementation Steps

1. **Update GraphQL schema**
   ```
   core/gateway/app/schema.graphql
   ```
   - Add `entity(id: ID!): Entity`
   - Add `relationships(type: String, fromId: ID, toId: ID): [Relationship!]!`
   - Consider GraphQL subscriptions (optional, may use WS instead)

2. **Add resolvers**
   ```
   core/gateway/app/resolvers.py
   ```
   - Implement `resolve_entity(id)`
   - Enhance `resolve_relationships` with filters
   - Add to OntologyClient: `get_entity(id)`, `get_relationships(filters)`

3. **Update Ontology service**
   ```
   core/ontology/app/
     ├── routes.py              # Add GET /entities/:id, GET /relationships with query params
     └── store.py               # Add filtered query methods
   ```

4. **Create frontend hooks**
   ```
   ui/src/hooks/
     ├── useEntity.ts           # Fetch single entity by ID
     └── useFilteredRelationships.ts  # Filtered relationships hook
   ```

---

## Phase 2.5: Entity Inspector Side Drawer

### Goals
- Add slide-out drawer component for entity details
- Display full entity attributes in structured format
- Show connected relationships (incoming/outgoing)
- Support selection from Map, Graph, and List panels

### Implementation Steps

1. **Create Drawer component**
   ```
   ui/src/components/
     ├── Drawer.tsx             # Reusable slide-out drawer
     └── EntityInspector.tsx    # Entity-specific inspector content
   ```

2. **Create selection state management**
   - Use Zustand store (already in dependencies) or React Context
   ```
   ui/src/store/
     └── selectionStore.ts      # Global selected entity state
   ```

3. **Implement `EntityInspector` component**
   - Display entity ID, type, attrs in structured format
   - Fetch and display related relationships (incoming/outgoing)
   - Use `useEntity()` hook for entity details
   - Use filtered relationships hooks for connections

4. **Update panels to trigger selection**
   - `MapPanel`: Click marker → set selected entity
   - `GraphPanel`: Click node → set selected entity
   - `ListPanel`: Click list item → set selected entity

5. **Integrate Drawer in App**
   ```
   ui/src/App.tsx
   ```
   - Add `<EntityInspector />` with Zustand store subscription
   - Handle open/close state

6. **Styling**
   - Slide from right side
   - Dark theme consistent with existing UI
   - Scrollable content area
   - Close button/overlay

---

## Phase 2.6: Code Quality & Modularity

### Goals
- Ensure all code follows STYLEGUIDE.md
- Maintain modular structure
- Add proper TypeScript types
- Handle errors gracefully

### Checklist

- [ ] All components are functional (no classes)
- [ ] Data fetching only in hooks
- [ ] No prop drilling (use Zustand/Context where needed)
- [ ] All async calls wrapped in try/catch
- [ ] WebSocket cleanup on unmount
- [ ] TypeScript strict mode (no `any`)
- [ ] Small, single-responsibility files
- [ ] Reusable components in `/components`
- [ ] Feature modules in `/modules`
- [ ] Semantic Tailwind tokens only
- [ ] No hard-coded values (use config/API)

---

## Implementation Order (Recommended)

1. **Phase 2.1: MapLibre Map** (Foundation for visualization)
2. **Phase 2.5: Entity Inspector** (Enables interactivity across panels)
3. **Phase 2.2: Cytoscape.js Graph** (Builds on inspector pattern)
4. **Phase 2.4: Enhanced Read-model** (Needed for inspector relationships)
5. **Phase 2.3: WebSocket Streaming** (Final enhancement for real-time)

---

## Testing Strategy

1. **Unit Tests** (optional, but recommended)
   - Test hooks in isolation
   - Test data transformation functions

2. **Integration Testing**
   - Test WebSocket connection/disconnection
   - Test entity selection flow across panels
   - Test map marker rendering with Location data

3. **Manual Testing Checklist**
   - [ ] Map displays Location entities as markers
   - [ ] Graph renders entities and relationships
   - [ ] Clicking map/graph/list item opens inspector
   - [ ] Inspector shows entity details and relationships
   - [ ] WebSocket updates appear in real-time
   - [ ] Error states display gracefully
   - [ ] Loading states show appropriately

---

## Files to Create/Modify

### New Files
```
ui/src/modules/map/MapCanvas.tsx
ui/src/modules/map/MapMarker.tsx
ui/src/modules/map/useMapData.ts
ui/src/modules/graph/GraphCanvas.tsx
ui/src/modules/graph/useGraphData.ts
ui/src/services/websocket.ts
ui/src/hooks/useEntityStream.ts
ui/src/hooks/useEntity.ts
ui/src/hooks/useFilteredRelationships.ts
ui/src/components/Drawer.tsx
ui/src/components/EntityInspector.tsx
ui/src/store/selectionStore.ts
core/gateway/app/websocket.py
```

### Modified Files
```
ui/package.json
ui/src/modules/map/MapPanel.tsx
ui/src/modules/graph/GraphPanel.tsx
ui/src/modules/list/index.tsx
ui/src/App.tsx
ui/src/services/config.ts
core/gateway/app/main.py
core/gateway/app/resolvers.py
core/gateway/app/schema.graphql
core/gateway/app/clients.py
core/ontology/app/routes.py
core/ontology/app/store.py
core/gateway/pyproject.toml
```

---

## Notes

- Keep all components small and focused
- Follow STYLEGUIDE.md naming conventions (PascalCase components, camelCase hooks, kebab-case files)
- Use Tailwind semantic tokens (`surface`, `panel`, `accent`, `muted`)
- Handle WebSocket reconnection gracefully
- Ensure proper cleanup in useEffect hooks
- Test with existing seed data first, then add more test entities if needed
