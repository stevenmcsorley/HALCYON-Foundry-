/**
 * Query shape inference and validation utilities
 * Detects data shapes from query results and validates panel compatibility
 */

export type QueryShape = 'entities' | 'counts' | 'metric' | 'geo' | 'items' | 'unknown'

export interface ShapeInfo {
  shape: QueryShape
  confidence: 'high' | 'medium' | 'low'
  hint?: string
}

/**
 * Infer the shape of query result data
 */
export function inferShape(data: any): ShapeInfo {
  if (!data || typeof data !== 'object') {
    return { shape: 'unknown', confidence: 'low' }
  }

  // Check for entities array
  if (Array.isArray(data.entities) && data.entities.length > 0) {
    const first = data.entities[0]
    if (first && typeof first === 'object' && (first.id || first.type)) {
      // Check if entities have geo coordinates
      if (first.attrs?.lat && first.attrs?.lon) {
        return { shape: 'geo', confidence: 'high', hint: 'entities[] with lat/lon' }
      }
      return { shape: 'entities', confidence: 'high', hint: 'entities[]' }
    }
  }

  // Check for counts/timeline data
  if (Array.isArray(data.buckets) || Array.isArray(data.counts)) {
    const arr = data.buckets || data.counts
    if (arr.length > 0 && arr[0] && typeof arr[0] === 'object') {
      if (arr[0].ts || arr[0].bucket || arr[0].count !== undefined) {
        return { shape: 'counts', confidence: 'high', hint: 'buckets[] or counts[]' }
      }
    }
  }

  // Check for metric value
  if (typeof data.value === 'number' || (data.data && typeof data.data.value === 'number')) {
    return { shape: 'metric', confidence: 'high', hint: 'value: number' }
  }

  // Check for count metric
  if (typeof data.count === 'number' || (data.data && typeof data.data.count === 'number')) {
    return { shape: 'metric', confidence: 'high', hint: 'count: number' }
  }

  // Check for items array (for TopBar)
  if (Array.isArray(data.items) && data.items.length > 0) {
    const first = data.items[0]
    if (first && typeof first === 'object' && (first.label !== undefined || first.value !== undefined)) {
      return { shape: 'items', confidence: 'high', hint: 'items[] with label/value' }
    }
  }

  // Check for points array (for GeoHeat)
  if (Array.isArray(data.points) && data.points.length > 0) {
    const first = data.points[0]
    if (first && typeof first === 'object' && (first.lat !== undefined && first.lon !== undefined)) {
      return { shape: 'geo', confidence: 'high', hint: 'points[] with lat/lon' }
    }
  }

  // Check for any array that might be entities
  const arrays = Object.values(data).filter(v => Array.isArray(v)) as any[][]
  if (arrays.length > 0) {
    const firstArray = arrays[0]
    if (firstArray.length > 0 && firstArray[0] && typeof firstArray[0] === 'object') {
      if (firstArray[0].id || firstArray[0].type) {
        return { shape: 'entities', confidence: 'medium', hint: 'array[] (entities-like)' }
      }
    }
  }

  return { shape: 'unknown', confidence: 'low' }
}

/**
 * Get expected shape for a panel type
 */
export function getExpectedShape(panelType: string): QueryShape | QueryShape[] {
  switch (panelType) {
    case 'map':
    case 'list':
    case 'table':
    case 'graph':
      return 'entities'
    case 'timeline':
      return 'counts'
    case 'metric':
      return 'metric'
    case 'topbar':
      return 'items'
    case 'geoheat':
      return 'geo'
    default:
      return 'unknown'
  }
}

/**
 * Check if a shape is compatible with a panel type
 */
export function isShapeCompatible(shape: QueryShape, panelType: string): boolean {
  const expected = getExpectedShape(panelType)
  if (Array.isArray(expected)) {
    return expected.includes(shape)
  }
  return expected === shape || shape === 'unknown'
}

/**
 * Get shape badge label
 */
export function getShapeLabel(shape: QueryShape): string {
  switch (shape) {
    case 'entities':
      return 'entities[]'
    case 'counts':
      return 'counts[]'
    case 'metric':
      return 'metric'
    case 'geo':
      return 'geo[]'
    case 'items':
      return 'items[]'
    default:
      return '?'
  }
}

/**
 * Get panel type hint message
 */
export function getPanelHint(panelType: string): string {
  switch (panelType) {
    case 'map':
      return 'Pick a query that returns entities[] with lat/lon for this panel.'
    case 'list':
    case 'table':
      return 'Pick a query that returns entities[] for this panel.'
    case 'graph':
      return 'Pick a query that returns entities[] (and optionally relationships[]) for this panel.'
    case 'timeline':
      return 'Pick a query that returns counts[] or buckets[] for this panel.'
    case 'metric':
      return 'Pick a query that returns a numeric value or count for this panel.'
    case 'topbar':
      return 'Pick a query that returns items[] or entities[] (will rollup) for this panel.'
    case 'geoheat':
      return 'Pick a query that returns geo[] or entities[] with lat/lon for this panel.'
    default:
      return 'Pick a compatible query for this panel.'
  }
}
