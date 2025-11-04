import React, { useMemo, useState, useEffect } from 'react'
import { Card } from '@/components/Card'
import GraphCanvas from './GraphCanvas'
import { useRelationships } from '@/hooks/useRelationships'
import { useEntities } from '@/hooks/useEntities'
import { useLiveStore } from '@/store/liveStore'

export const GraphPanel: React.FC = () => {
  const { relationships, loading: relLoading, error: relError } = useRelationships()
  const { entities, loading: entLoading, onNewEntity } = useEntities()
  const { followLiveGraph, setFollowLiveGraph } = useLiveStore()
  const [latestEntity, setLatestEntity] = useState<any>(null)

  useEffect(() => {
    onNewEntity((entity) => {
      setLatestEntity(entity)
    })
  }, [onNewEntity])

  const elements = useMemo(() => {
    const nodes = entities.map((e) => ({
      data: {
        id: e.id,
        label: e.type === 'Location' && e.attrs.name ? e.attrs.name : e.id,
        type: e.type
      }
    }))

    const edges = relationships.map((rel, idx) => ({
      data: {
        id: `edge-${idx}`,
        source: rel.fromId,
        target: rel.toId,
        label: rel.type
      }
    }))

    return { nodes, edges }
  }, [entities, relationships])

  return (
    <Card title="Graph">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="text-sm opacity-80">Graph</div>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={followLiveGraph}
            onChange={(e) => setFollowLiveGraph(e.target.checked)}
            className="w-3 h-3"
          />
          Follow Live
        </label>
      </div>
      {(relLoading || entLoading) && <div className="text-sm text-muted mb-2 flex-shrink-0 p-3">Loading...</div>}
      {relError && <div className="text-sm text-red-400 mb-2 flex-shrink-0 p-3">Error: {relError}</div>}
      {!relLoading && !entLoading && (
        <div className="flex-1 min-h-0 p-3" style={{ position: 'relative', height: '100%' }}>
          <GraphCanvas elements={elements} followLive={followLiveGraph} latestEntity={latestEntity} />
        </div>
      )}
    </Card>
  )
}
