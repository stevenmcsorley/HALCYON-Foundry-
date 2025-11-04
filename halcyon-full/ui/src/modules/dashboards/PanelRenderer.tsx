import React from 'react'
import type { PanelType, SavedQuery } from '@/store/savedStore'
import { MapPanel } from '@/modules/map'
import GraphCanvas from '@/modules/graph/GraphCanvas'
import { ListPanel } from '@/modules/list'
import { TimelinePanel } from '@/modules/timeline'
import { TablePanel } from './panels/TablePanel'
import { TopBarPanel } from './panels/TopBarPanel'
import { GeoHeatPanel } from './panels/GeoHeatPanel'
import { gql } from '@/services/api'
import { Card } from '@/components/Card'

export default function PanelRenderer({ type, query, refreshSec = 30, config }: { type: PanelType; query: SavedQuery; refreshSec?: number; config?: Record<string, unknown> }) {
  const [data, setData] = React.useState<any>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    let intervalId: number | undefined

    const fetchData = async () => {
      setLoading(true)
      try {
        const result = await gql<any>(query.gql, {})
        if (!cancelled) {
          setData(result)
          setError(null)
          setLoading(false)
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message)
          setData(null)
          setLoading(false)
        }
      }
    }

    fetchData()

    // Set up refresh interval
    if (refreshSec && refreshSec >= 5) {
      intervalId = window.setInterval(fetchData, refreshSec * 1000)
    }

    return () => {
      cancelled = true
      if (intervalId) clearInterval(intervalId)
    }
  }, [query.gql, refreshSec])

  if (loading) {
    return <div className="text-sm text-muted p-4">Loading...</div>
  }

  if (error) {
    return <div className="text-red-400 text-sm p-4">Error: {error}</div>
  }

  if (type === 'metric') {
    // Try various ways to extract a numeric value
    let val: number | string = '—'
    if (data) {
      // Direct value
      if (typeof data.value === 'number') {
        val = data.value
      }
      // Nested result.value
      else if (data.result?.value && typeof data.result.value === 'number') {
        val = data.result.value
      }
      // Count of array results
      else if (Array.isArray(data.entities)) {
        val = data.entities.length
      }
      else if (Array.isArray(data.relationships)) {
        val = data.relationships.length
      }
      // Count first array value in data
      else {
        const firstArray = Object.values(data).find(v => Array.isArray(v)) as any[]
        if (firstArray) {
          val = firstArray.length
        }
        // Fallback to first value
        else {
          const firstVal = Object.values(data)[0]
          if (firstVal !== undefined && firstVal !== null) {
            val = String(firstVal)
          }
        }
      }
    }
    return (
      <div className="text-center p-4">
        <div className="text-3xl font-bold text-white">{String(val)}</div>
      </div>
    )
  }

  if (type === 'list') {
    return (
      <pre className="text-xs overflow-auto max-h-64 text-white bg-black/20 p-2 rounded">
        {JSON.stringify(data, null, 2)}
      </pre>
    )
  }

  if (type === 'graph') {
    // Transform query result to graph format
    const entities = data?.entities || []
    const relationships = data?.relationships || []
    
    // Extract from nested structure if needed
    const allEntities = entities.length > 0 ? entities : (data?.data?.entities || Object.values(data || {}).flat().filter((v: any) => v && typeof v === 'object' && v.id && v.type))
    const allRelationships = relationships.length > 0 ? relationships : (data?.data?.relationships || [])

    const nodes = allEntities.map((e: any) => ({
      data: {
        id: e.id,
        label: e.type === 'Location' && e.attrs?.name ? e.attrs.name : e.id,
        type: e.type
      }
    }))

    // Only include edges where both source and target nodes exist
    const nodeIds = new Set(nodes.map(n => n.data.id))
    const edges = allRelationships
      .filter((rel: any) => nodeIds.has(rel.fromId) && nodeIds.has(rel.toId))
      .map((rel: any, idx: number) => ({
        data: {
          id: `edge-${idx}`,
          source: rel.fromId,
          target: rel.toId,
          label: rel.type
        }
      }))

    return (
      <Card title="Graph">
        <GraphCanvas elements={{ nodes, edges }} />
      </Card>
    )
  }

  if (type === 'timeline') return <TimelinePanel />
  if (type === 'map') return <MapPanel />

  if (type === 'table') {
    return <TablePanel data={data} config={config as any} />
  }

  if (type === 'topbar') {
    return <TopBarPanel data={data} config={config as any} />
  }

  if (type === 'geoheat') {
    return <GeoHeatPanel data={data} config={config as any} />
  }

  return <div className="text-white opacity-70">Unknown panel type: {type}</div>
}
