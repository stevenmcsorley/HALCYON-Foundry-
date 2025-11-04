import React, { useMemo } from 'react'
import { Card } from '@/components/Card'
import GraphCanvas from './GraphCanvas'
import { useRelationships } from '@/hooks/useRelationships'
import { useEntities } from '@/hooks/useEntities'

export const GraphPanel: React.FC = () => {
  const { relationships, loading: relLoading, error: relError } = useRelationships()
  const { entities, loading: entLoading } = useEntities()

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
      {(relLoading || entLoading) && <div className="text-sm text-muted mb-2">Loading...</div>}
      {relError && <div className="text-sm text-red-400 mb-2">Error: {relError}</div>}
      <GraphCanvas elements={elements} />
    </Card>
  )
}
