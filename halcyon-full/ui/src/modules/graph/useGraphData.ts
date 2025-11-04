import { useMemo } from 'react'
import { useEntities } from '@/hooks/useEntities'
import { useRelationships } from '@/hooks/useRelationships'
import { ElementsDefinition } from 'cytoscape'

export function useGraphData() {
  const { entities, loading: entitiesLoading, error: entitiesError } = useEntities()
  const { relationships, loading: relsLoading, error: relsError } = useRelationships()

  const graphData = useMemo<ElementsDefinition>(() => {
    const nodes = entities.map((entity) => ({
      data: {
        id: entity.id,
        label: entity.type === 'Location' && entity.attrs.name ? entity.attrs.name : entity.id,
        type: entity.type,
        attrs: entity.attrs
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

  return {
    graphData,
    loading: entitiesLoading || relsLoading,
    error: entitiesError || relsError
  }
}
