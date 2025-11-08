import React from 'react'
import type { PanelType, SavedQuery } from '@/store/savedStore'
import { MapPanel } from '@/modules/map'
import GraphCanvas from '@/modules/graph/GraphCanvas'
import { TimelinePanel } from '@/modules/timeline'
import { TablePanel } from './panels/TablePanel'
import { TopBarPanel } from './panels/TopBarPanel'
import { GeoHeatPanel } from './panels/GeoHeatPanel'
import { gql } from '@/services/api'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import {
  inferShape,
  isShapeCompatible,
  getExpectedShape,
  getPanelHint,
  getShapeLabel,
  type QueryShape,
} from '@/lib/queryShapes'
import { savedApi } from '@/store/savedStore'
import { AlertDialog } from '@/components/AlertDialog'
import { dashboardStream } from '@/services/dashboardStream'

type PanelRendererProps = {
  type: PanelType
  query?: SavedQuery | null
  refreshSec?: number
  config?: Record<string, unknown>
  onQueryChange?: () => void
}

export default function PanelRenderer({
  type,
  query,
  refreshSec = 30,
  config,
  onQueryChange,
}: PanelRendererProps) {
  const [data, setData] = React.useState<any>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [shapeMismatch, setShapeMismatch] = React.useState<{
    detected: QueryShape
    expected: QueryShape | QueryShape[]
  } | null>(null)
  const [alertDialog, setAlertDialog] = React.useState<{ isOpen: boolean; title: string; message: string }>({
    isOpen: false,
    title: '',
    message: '',
  })
  const [liveRows, setLiveRows] = React.useState<any[]>([])

  const liveTopic = React.useMemo(() => {
    const configuredTopic = typeof config?.liveTopic === 'string' ? config.liveTopic : undefined
    if (configuredTopic) return configuredTopic
    const sourceId = typeof config?.liveSourceId === 'string' ? config.liveSourceId : undefined
    return sourceId ? `datasource.${sourceId}` : undefined
  }, [config])

  const liveLimit = React.useMemo(() => {
    const raw = (config?.liveLimit ?? config?.live_limit) as number | string | undefined
    const parsed = typeof raw === 'number' ? raw : raw ? parseInt(String(raw), 10) : NaN
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 200
  }, [config])

  React.useEffect(() => {
    if (!liveTopic) {
      setLiveRows([])
      return
    }
    const unsubscribe = dashboardStream.subscribe(liveTopic, (payload: any) => {
      const entity = payload?.data ?? payload
      if (!entity) return
      const entityId = entity.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
      setLiveRows((prev) => {
        const deduped = prev.filter((item) => item.id !== entityId)
        return [{ ...entity, id: entityId }, ...deduped].slice(0, liveLimit)
      })
    })
    return () => unsubscribe()
  }, [liveTopic, liveLimit])

  React.useEffect(() => {
    if (liveTopic && liveRows.length > 0) {
      setShapeMismatch(null)
      setError(null)
      setLoading(false)
    }
  }, [liveTopic, liveRows.length])

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

          const shapeInfo = inferShape(result)
          const expected = getExpectedShape(type)
          const compatible = isShapeCompatible(shapeInfo.shape, type)

          if (!compatible && shapeInfo.confidence === 'high') {
            setShapeMismatch({
              detected: shapeInfo.shape,
              expected,
            })

            const expectedLabels = Array.isArray(expected)
              ? expected.map((s) => getShapeLabel(s)).join(' or ')
              : getShapeLabel(expected)

            setAlertDialog({
              isOpen: true,
              title: 'Query Shape Mismatch',
              message: `This query returns ${getShapeLabel(shapeInfo.shape)}; this panel expects ${expectedLabels}. The panel will show an empty state until you change the query.`,
            })

            if (!query.shapeHint && query.id) {
              try {
                await savedApi.updateQuery(query.id, { shapeHint: shapeInfo.shape })
              } catch {
                /* ignore */
              }
            }
          } else {
            setShapeMismatch(null)

            if (!query.shapeHint && query.id && shapeInfo.confidence === 'high') {
              try {
                await savedApi.updateQuery(query.id, { shapeHint: shapeInfo.shape })
              } catch {
                /* ignore */
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

    if (!liveTopic && refreshSec && refreshSec >= 5) {
      intervalId = window.setInterval(fetchData, refreshSec * 1000)
    }

    return () => {
      cancelled = true
      if (intervalId) clearInterval(intervalId)
    }
  }, [query?.gql, query?.id, refreshSec, type, liveTopic])

  const liveData = React.useMemo(() => {
    if (!liveTopic || liveRows.length === 0) return null
    if (type === 'metric') {
      return {
        value: liveRows.length,
        entities: liveRows,
      }
    }
    if (type === 'timeline') {
      return null
    }
    return { entities: liveRows }
  }, [liveRows, liveTopic, type])

  const renderData = liveData ?? data
  const hasLiveData = Boolean(liveData)

  if (!query) {
    return (
      <EmptyState
        title="No Query Selected"
        message={getPanelHint(type)}
        actionLabel={onQueryChange ? 'Select Query' : undefined}
        onAction={onQueryChange}
      />
    )
  }

  if (loading && !hasLiveData) {
    return <div className="text-sm text-muted p-4">Loading...</div>
  }

  if (error && !hasLiveData) {
    return (
      <div className="p-4">
        <div className="text-red-400 text-sm mb-2">Error: {error}</div>
        {onQueryChange && (
          <button onClick={onQueryChange} className="text-xs text-teal-400 hover:text-teal-300 underline">
            Change query
          </button>
        )}
      </div>
    )
  }

  if (shapeMismatch && !hasLiveData) {
    const expectedLabels = Array.isArray(shapeMismatch.expected)
      ? shapeMismatch.expected.map((s) => getShapeLabel(s)).join(' or ')
      : getShapeLabel(shapeMismatch.expected)

    return (
      <>
        <EmptyState
          title="Query Shape Mismatch"
          message={`This query returns ${getShapeLabel(shapeMismatch.detected)}, but this panel expects ${expectedLabels}. Please select a compatible query.`}
          actionLabel={onQueryChange ? 'Change Query' : undefined}
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
    let val: number | string = '—'
    if (renderData) {
      if (typeof renderData.value === 'number') {
        val = renderData.value
      } else if (renderData.result?.value && typeof renderData.result.value === 'number') {
        val = renderData.result.value
      } else if (Array.isArray(renderData.entities)) {
        val = renderData.entities.length
      } else if (Array.isArray(renderData.relationships)) {
        val = renderData.relationships.length
      } else {
        const firstArray = Object.values(renderData).find((v) => Array.isArray(v)) as any[]
        if (firstArray) {
          val = firstArray.length
        } else {
          const firstVal = Object.values(renderData)[0]
          if (firstVal !== undefined && firstVal !== null) {
            val = String(firstVal)
          }
        }
      }
    }
    return (
      <div className="text-center p-4">
        {liveTopic && (
          <div className="flex items-center justify-center gap-2 text-xs uppercase tracking-wide text-emerald-200 mb-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-300 animate-pulse" />
            Live
          </div>
        )}
        <div className="text-3xl font-bold text-white">{String(val)}</div>
      </div>
    )
  }

  if (type === 'graph') {
    const entities = renderData?.entities || []
    const relationships = renderData?.relationships || []

    const allEntities =
      entities.length > 0
        ? entities
        : renderData?.data?.entities || Object.values(renderData || {}).flat().filter((v: any) => v && typeof v === 'object' && v.id && v.type)
    const allRelationships = relationships.length > 0 ? relationships : renderData?.data?.relationships || []

    const nodes = allEntities.map((e: any) => ({
      data: {
        id: e.id,
        label: e.type === 'Location' && e.attrs?.name ? e.attrs.name : e.id,
        type: e.type,
      },
    }))

    const nodeIds = new Set(nodes.map((n) => n.data.id))
    const edges = allRelationships
      .filter((rel: any) => nodeIds.has(rel.fromId) && nodeIds.has(rel.toId))
      .map((rel: any, idx: number) => ({
        data: {
          id: `edge-${idx}`,
          source: rel.fromId,
          target: rel.toId,
          label: rel.type,
        },
      }))

    return (
      <Card title="Graph">
        <GraphCanvas elements={{ nodes, edges }} />
      </Card>
    )
  }

  if (type === 'timeline') {
    return <TimelinePanel />
  }

  if (type === 'map') {
    return <MapPanel />
  }

  if (type === 'table') {
    return (
      <div className="flex flex-col h-full">
        {liveTopic && (
          <div className="flex items-center gap-2 px-3 py-2 text-xs uppercase tracking-wide text-emerald-200 border-b border-emerald-400/30 bg-emerald-500/10">
            <span className="flex h-2 w-2 rounded-full bg-emerald-300 animate-pulse" />
            Live stream
          </div>
        )}
        <TablePanel data={renderData} config={config as any} />
      </div>
    )
  }

  if (type === 'topbar') {
    return <TopBarPanel data={renderData} config={config as any} />
  }

  if (type === 'geoheat') {
    return <GeoHeatPanel data={renderData} config={config as any} />
  }

  return (
    <pre className="text-xs overflow-auto max-h-64 text-white bg-black/20 p-2 rounded">
      {JSON.stringify(renderData, null, 2)}
    </pre>
  )
}
