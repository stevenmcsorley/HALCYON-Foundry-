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
import { EmptyState } from '@/components/EmptyState'
import { inferShape, isShapeCompatible, getExpectedShape, getPanelHint, getShapeLabel, type QueryShape } from '@/lib/queryShapes'
import { savedApi } from '@/store/savedStore'
import { AlertDialog } from '@/components/AlertDialog'

export default function PanelRenderer({ 
  type, 
  query, 
  refreshSec = 30, 
  config,
  onQueryChange
}: { 
  type: PanelType
  query?: SavedQuery | null
  refreshSec?: number
  config?: Record<string, unknown>
  onQueryChange?: () => void
}) {
  const [data, setData] = React.useState<any>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [shapeMismatch, setShapeMismatch] = React.useState<{ detected: QueryShape; expected: QueryShape | QueryShape[] } | null>(null)
  const [alertDialog, setAlertDialog] = React.useState<{ isOpen: boolean; title: string; message: string }>({
    isOpen: false,
    title: '',
    message: ''
  })

  React.useEffect(() => {
    if (!query) {
      setData(null)
      setError(null)
      setLoading(false)
      setShapeMismatch(null)
      return
    }

    let cancelled = false
    let intervalId: number | undefined

    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await gql<any>(query.gql, {})
        if (!cancelled) {
          setData(result)
          
          // Infer and validate shape
          const shapeInfo = inferShape(result)
          const expected = getExpectedShape(type)
          const compatible = isShapeCompatible(shapeInfo.shape, type)
          
          if (!compatible && shapeInfo.confidence === 'high') {
            setShapeMismatch({
              detected: shapeInfo.shape,
              expected: expected
            })
            
            // Non-blocking alert
            const expectedLabels = Array.isArray(expected) 
              ? expected.map(s => getShapeLabel(s)).join(' or ')
              : getShapeLabel(expected)
            
            setAlertDialog({
              isOpen: true,
              title: 'Query Shape Mismatch',
              message: `This query returns ${getShapeLabel(shapeInfo.shape)}; this panel expects ${expectedLabels}. The panel will show an empty state until you change the query.`
            })
            
            // Cache shapeHint if not set
            if (!query.shapeHint && query.id) {
              try {
                await savedApi.updateQuery(query.id, { shapeHint: shapeInfo.shape })
              } catch {
                // Silent fail - shapeHint update is optional
              }
            }
          } else {
            setShapeMismatch(null)
            
            // Cache shapeHint if not set
            if (!query.shapeHint && query.id && shapeInfo.confidence === 'high') {
              try {
                await savedApi.updateQuery(query.id, { shapeHint: shapeInfo.shape })
              } catch {
                // Silent fail
              }
            }
          }
          
          setLoading(false)
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message)
          setData(null)
          setShapeMismatch(null)
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
  }, [query?.gql, query?.id, refreshSec, type])

  // No query assigned
  if (!query) {
    return (
      <EmptyState
        title="No Query Selected"
        message={getPanelHint(type)}
        actionLabel={onQueryChange ? "Select Query" : undefined}
        onAction={onQueryChange}
      />
    )
  }

  if (loading) {
    return <div className="text-sm text-muted p-4">Loading...</div>
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="text-red-400 text-sm mb-2">Error: {error}</div>
        {onQueryChange && (
          <button
            onClick={onQueryChange}
            className="text-xs text-teal-400 hover:text-teal-300 underline"
          >
            Change query
          </button>
        )}
      </div>
    )
  }

  // Shape mismatch - show EmptyState
  if (shapeMismatch) {
    const expectedLabels = Array.isArray(shapeMismatch.expected)
      ? shapeMismatch.expected.map(s => getShapeLabel(s)).join(' or ')
      : getShapeLabel(shapeMismatch.expected)
    
    return (
      <>
        <EmptyState
          title="Query Shape Mismatch"
          message={`This query returns ${getShapeLabel(shapeMismatch.detected)}, but this panel expects ${expectedLabels}. Please select a compatible query.`}
          actionLabel={onQueryChange ? "Change Query" : undefined}
          onAction={onQueryChange}
        />
        <AlertDialog
          isOpen={alertDialog.isOpen}
          onClose={() => setAlertDialog({ isOpen: false, title: '', message: '' })}
          title={alertDialog.title}
          message={alertDialog.message}
          variant="info"
        />
      </>
    )
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
