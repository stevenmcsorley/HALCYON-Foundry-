import React from 'react'
import type { PanelType, SavedQuery } from '@/store/savedStore'
import { MapPanel } from '@/modules/map'
import { GraphPanel } from '@/modules/graph'
import { ListPanel } from '@/modules/list'
import { TimelinePanel } from '@/modules/timeline'
import { gql } from '@/services/api'

export default function PanelRenderer({ type, query }: { type: PanelType; query: SavedQuery }) {
  const [data, setData] = React.useState<any>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await gql<any>(query.gql, {})
        if (!cancelled) {
          setData(result)
          setError(null)
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message)
          setData(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [query.gql])

  if (error) {
    return <div className="text-red-400 text-sm">Error: {error}</div>
  }

  if (type === 'metric') {
    const val = (data && (data.value ?? data.result?.value ?? Object.values(data)[0])) ?? '—'
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

  if (type === 'timeline') return <TimelinePanel />
  if (type === 'map') return <MapPanel />
  if (type === 'graph') return <GraphPanel />

  return <div className="text-white opacity-70">Unknown panel type: {type}</div>
}
