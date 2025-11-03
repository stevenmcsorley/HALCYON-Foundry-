# HALCYON Frontend + TypeScript Style Guide

## Principles
- Clarity over cleverness; composable over monolithic.
- No mocks or hard-coded values; config and APIs only.
- No over-abstraction; keep layers thin and useful.
- Strict typing; never `any`.
- Small files; single-responsibility modules.

## Structure
```
/ui/src/
  /components/       # Pure, reusable
  /modules/          # Feature panels (map, graph, list, timeline, inspector)
  /hooks/            # Data/state hooks
  /services/         # API/WS clients
  /store/            # Zustand (lightweight) or Context
  /types/            # Shared TS types
  /theme/            # Tailwind tokens
  /utils/            # Pure helpers
```
Module example:
```
modules/map/MapPanel.tsx
modules/map/MapControls.tsx
modules/map/useMapData.ts
modules/map/index.ts
```

## Conventions
- Functional components + hooks; no classes.
- Data fetching only inside hooks (e.g., `useEntityQuery`).
- Avoid prop drilling; use lightweight context where needed.
- Guard all async calls with try/catch and error UI.
- Unsubscribe/cleanup all subscriptions and websockets.
- Tailwind only, semantic tokens; no raw hex.

## Naming
- Components: PascalCase; hooks: useCamelCase; files: kebab-case.
- Props are minimal and explicit.
- Constants: SCREAMING_SNAKE_CASE.

## Extensibility
- Plugin registration pattern `{ id, Component, register() }`.
- No circular deps; move shared to `/ui/src/core` (or `/utils`).
- Lazy-load heavy panels.

## Example
```tsx
import { useEntityQuery } from "@/hooks/useEntityQuery";
import { GraphCanvas } from "@/components/GraphCanvas";

export const GraphPanel = () => {
  const { data, loading, error } = useEntityQuery({ type: "relationships" });
  if (loading) return <div className="p-4 text-muted">Loading…</div>;
  if (error) return <div className="p-4 text-red-400">Error</div>;
  return <GraphCanvas nodes={data.nodes} edges={data.edges} />;
};
```
