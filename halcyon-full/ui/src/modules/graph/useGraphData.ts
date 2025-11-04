import { useState, useMemo, useCallback } from 'react'
import { useEntities } from '@/hooks/useEntities'
import { useRelationships } from '@/hooks/useRelationships'

export type EntityTypeFilter = 'all' | 'Event' | 'Asset' | 'Location' | 'Anomaly'
export type SeverityFilter = 'all' | 'low' | 'medium' | 'high'
export type TimeWindow = 'all' | '1h' | '6h' | '24h'

const NODE_CAP = 200

interface GraphFilters {
  entityType: EntityTypeFilter
  severity: SeverityFilter
  timeWindow: TimeWindow
}

export function useGraphData(filters: GraphFilters, nodeLimit: number) {
  const { entities, loading: entitiesLoading, error: entitiesError } = useEntities()
  const { relationships, loading: relLoading, error: relError } = useRelationships()

  // Filter and cap nodes
  const filteredElements = useMemo(() => {
    const now = Date.now()
    const timeWindows = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
    }

    // Filter entities
    let filteredEntities = entities.filter((e) => {
      // Entity type filter
      if (filters.entityType !== 'all' && e.type !== filters.entityType) {
        return false
      }

      // Severity filter
      if (filters.severity !== 'all') {
        const severity = e.attrs?.severity?.toLowerCase()
        if (severity !== filters.severity) {
          return false
        }
      }

      // Time window filter
      if (filters.timeWindow !== 'all') {
        const timestamp = e.attrs?.timestamp
        if (!timestamp) return false
        const ts = new Date(timestamp).getTime()
        const window = timeWindows[filters.timeWindow as keyof typeof timeWindows]
        if (now - ts > window) {
          return false
        }
      }

      return true
    })

    // Cap nodes
    const cappedEntities = filteredEntities.slice(0, nodeLimit)

    // Filter relationships to only include entities we're showing
    const entityIds = new Set(cappedEntities.map(e => e.id))
    const filteredRels = relationships.filter(
      rel => entityIds.has(rel.fromId) && entityIds.has(rel.toId)
    )

    // Transform to Cytoscape format
    const nodes = cappedEntities.map((e) => ({
      data: {
        id: e.id,
        label: e.type === 'Location' && e.attrs.name ? e.attrs.name : e.id,
        type: e.type,
      }
    }))

    const edges = filteredRels.map((rel, idx) => ({
      data: {
        id: `edge-${idx}`,
        source: rel.fromId,
        target: rel.toId,
        label: rel.type
      }
    }))

    return { nodes, edges, totalFiltered: filteredEntities.length, hasMore: filteredEntities.length > nodeLimit }
  }, [entities, relationships, filters, nodeLimit])

  return {
    elements: filteredElements,
    loading: entitiesLoading || relLoading,
    error: entitiesError || relError,
  }
}
