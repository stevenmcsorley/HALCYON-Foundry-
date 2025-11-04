# Panels and Queries - Compatibility Guide

This document explains how to match saved queries with dashboard panels based on data shapes.

## Quick Reference: Compatibility Matrix

| Panel | Expected Shape | Typical Queries | Notes |
|-------|---------------|-----------------|-------|
| **Map** | `entities[]` with `attrs.lat`/`attrs.lon` | Recent Entities w/ coords | Requires geographic data |
| **List** | `entities[]` | Recent Events / Assets / Locations | Simple entity listing |
| **Table** | `entities[]` or `data.rows[]` | Recent Events (project fields) | Can extract from nested arrays |
| **Graph** | `entities[]`, `relationships[]` (optional) | Entities + Relationships in window | Both arrays or entities only |
| **Timeline** | `{ buckets:[{ ts, count }] }` or `{ data.counts }` | Event Count 1h/6h/24h | Time-series count data |
| **Metric** | `{ value:number }` or `{ data.count }` | Total Events (window), Errors Today | Single numeric value |
| **TopBar** | `{ items:[{ label, value }] }` or rollup config | Top Event Types / Sources | Can rollup from entities |
| **GeoHeat** | `{ points:[{ lat, lon, intensity? }] }` or mappable keys | Recent Events with coords | Geographic density data |

## Shape Types

Queries return data in different shapes. The system automatically detects and validates shapes:

- **`entities[]`**: Array of entity objects with `{ id, type, attrs }`
- **`counts[]`**: Time-series data with `[{ ts, count }]` or `[{ bucket, count }]`
- **`metric`**: Single numeric value: `{ value: number }` or `{ count: number }`
- **`geo[]`**: Geographic data: entities with `lat`/`lon` or `{ points: [...] }`
- **`items[]`**: Categorical items: `[{ label, value }]`

## Example Queries by Panel Type

### Map Panel

**Query**: Recent Entities with Coordinates
```graphql
query {
  entitiesByType(type: "Event", limit: 200) {
    id
    type
    attrs
  }
}
```

**Result shape**: `entities[]` with `attrs.lat` and `attrs.lon`

### List Panel

**Query**: Recent Events
```graphql
query {
  entitiesByType(type: "Event", limit: 20) {
    id
    type
    attrs
  }
}
```

**Result shape**: `entities[]`

### Table Panel

**Query**: Recent Events (projected)
```graphql
query {
  entitiesByType(type: "Event", limit: 100) {
    id
    type
    attrs
  }
}
```

**Result shape**: `entities[]` (table infers columns from first entity)

### Graph Panel

**Query**: Entities and Relationships
```graphql
query {
  entities(limit: 100) {
    id
    type
    attrs
  }
  relationships(limit: 200) {
    id
    type
    fromId
    toId
  }
}
```

**Result shape**: `entities[]` and `relationships[]`

### Timeline Panel

**Query**: Event Counts by Hour
```graphql
query {
  eventsCount(bucket: "1h", limit: 24) {
    bucket
    count
  }
}
```

**Result shape**: `counts[]` with `[{ bucket, count }]`

**Alternative shape**:
```json
{
  "buckets": [
    { "ts": "2024-01-01T00:00:00Z", "count": 10 },
    { "ts": "2024-01-01T01:00:00Z", "count": 15 }
  ]
}
```

### Metric Panel

**Query**: Total Events
```graphql
query {
  entitiesByType(type: "Event", limit: 1) {
    id
  }
}
# Client-side: count the array length
```

**Or direct metric**:
```graphql
query {
  eventCount {
    total
  }
}
# Returns: { "eventCount": { "total": 1234 } }
```

**Result shape**: `metric` (numeric value)

### TopBar Panel

**Query**: Event Types
```graphql
query {
  entitiesByType(type: "Event", limit: 500) {
    type
  }
}
```

**Config**: `{ sourcePath: "data.entities", labelKey: "type", valueMode: "count" }`

**Result shape**: `items[]` (rollup from entities) or direct `{ items: [...] }`

### GeoHeat Panel

**Query**: Events with Coordinates
```graphql
query {
  entitiesByType(type: "Event", limit: 500) {
    id
    attrs {
      lat
      lon
      severity
    }
  }
}
```

**Config**: `{ latKey: "attrs.lat", lonKey: "attrs.lon", intensityKey: "attrs.severity" }`

**Result shape**: `geo[]` (entities with lat/lon)

## Adapting Queries to Match Shapes

### From entities to metric
Use client-side aggregation or request count:
```graphql
# Instead of full entities, request count
query {
  entitiesCount(type: "Event") {
    count
  }
}
```

### From entities to counts (Timeline)
Aggregate by time bucket:
```graphql
query {
  eventsCount(bucket: "1h", limit: 24) {
    bucket
    count
  }
}
```

### From entities to items (TopBar)
Use panel config to rollup:
- `sourcePath`: Path to entities array
- `labelKey`: Field to group by (e.g., `type`, `attrs.severity`)
- `valueMode`: `"count"` or `"sum"` (if value field specified)

### From any array to entities
If your query returns a nested array:
```json
{
  "data": {
    "myEvents": [{ "id": "...", "type": "Event", ... }]
  }
}
```

Panel renderers will attempt to extract entities from nested structures automatically.

## Shape Detection & Caching

The system automatically:
1. **Infers shapes** from query results on first run
2. **Caches `shapeHint`** on saved queries (optional metadata)
3. **Validates compatibility** when assigning queries to panels
4. **Shows helpful errors** when shapes mismatch

### Manual Shape Hint

You can manually set `shapeHint` when creating/updating a query (optional):
- `entities`
- `counts`
- `metric`
- `geo`
- `items`

If not set, the system infers it from the first successful query execution.

## Troubleshooting

### "Query Shape Mismatch" Error

**Problem**: Query returns `counts[]` but panel expects `entities[]`

**Solution**: 
- For Map/List/Table/Graph: Use a query that returns `entities[]`
- For Timeline: Use a query that returns `counts[]` or `buckets[]`

### Empty Panel After Query Assignment

**Problem**: Panel shows EmptyState with shape mismatch message

**Solution**: Check the compatibility matrix above and assign a query with the correct shape, or use the "Change Query" button in the EmptyState.

### Auto-inference Not Working

**Problem**: `shapeHint` is `unknown` even after running query

**Solution**: Ensure query returns data in one of the recognized shapes. Check console for query result structure.

## Best Practices

1. **Name queries descriptively**: Include shape hint in name (e.g., "Recent Events (entities)", "Event Count 1h (counts)")
2. **Use compatible queries**: Check the compatibility matrix before assigning
3. **Set shapeHint manually** for complex queries where auto-inference might fail
4. **Test queries first**: Run queries in Saved Queries panel to verify shape before adding to dashboard

## Quick Shape Reference

```
entities[]  → Map, List, Table, Graph
counts[]    → Timeline
metric      → Metric
geo[]       → Map, GeoHeat
items[]     → TopBar
```

## Common Fixes

### Convert counts → Metric

If you have a counts query but need a metric:

**Query**:
```graphql
query {
  eventCounts(range: "1h") {
    total
  }
}
```

**Metric Panel Config**: `{ "path": "data.eventCounts.total" }`

Or use a direct count query:
```graphql
query {
  entitiesByType(type: "Event", limit: 1) {
    id
  }
}
```
Returns `entities[]`, Metric panel counts array length automatically.

### Convert entities → TopBar

If you have entities but want categorical bars:

**Query**:
```graphql
query {
  entities(type: "Event", limit: 500) {
    type
  }
}
```

**TopBar Panel Config**:
```json
{
  "sourcePath": "data.entities",
  "labelKey": "type",
  "valueMode": "count"
}
```

This rolls up entities by `type` field and counts occurrences.

## Panel Quick Picks

Recommended saved queries by panel type:

| Panel | Query Example | Config |
|-------|--------------|--------|
| **Map** | `query { entitiesByType(type: "Event", limit: 200) { id type attrs } }` | (none) - requires `attrs.lat`/`attrs.lon` |
| **List** | `query { entitiesByType(type: "Event", limit: 20) { id type attrs } }` | (none) |
| **Table** | `query { entitiesByType(type: "Event", limit: 100) { id type attrs } }` | (none) - auto-infers columns |
| **Graph** | `query { entities(limit: 100) { id type } relationships(limit: 200) { fromId toId type } }` | (none) |
| **Timeline** | `query { eventCounts(bucket: "1h", limit: 24) { bucket count } }` | (none) |
| **Metric** | `query { entitiesByType(type: "Event", limit: 1) { id } }` | (none) - counts array |
| **TopBar** | `query { entities(type: "Event", limit: 500) { type } }` | `{ "sourcePath": "data.entities", "labelKey": "type", "valueMode": "count" }` |
| **GeoHeat** | `query { entitiesByType(type: "Event", limit: 500) { id attrs { lat lon severity } } }` | `{ "latKey": "attrs.lat", "lonKey": "attrs.lon", "intensityKey": "attrs.severity" }` |
