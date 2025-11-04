import React from 'react'
import { useSelectionStore } from '@/store/selectionStore'
import { Drawer } from './Drawer'
import { useEntity } from '@/hooks/useEntity'
import { useFilteredRelationships } from '@/hooks/useFilteredRelationships'

export const EntityInspector: React.FC = () => {
  const { selectedEntity, clearSelection } = useSelectionStore()
  const { entity, loading, error } = useEntity(selectedEntity?.id ?? null)
  const { relationships: outgoingRels } = useFilteredRelationships(selectedEntity?.id ?? null, null)
  const { relationships: incomingRels } = useFilteredRelationships(null, selectedEntity?.id ?? null)

  if (!selectedEntity) return null

  return (
    <Drawer isOpen={!!selectedEntity} onClose={clearSelection}>
      {loading && <div className="text-muted">Loading...</div>}
      {error && <div className="text-red-400">Error: {error}</div>}
      {entity && (
        <div className="space-y-4">
          {/* Entity Header */}
          <div>
            <div className="text-xs text-muted mb-1">Entity Type</div>
            <div className="text-sm font-medium">{entity.type}</div>
          </div>
          <div>
            <div className="text-xs text-muted mb-1">Entity ID</div>
            <div className="text-sm font-mono">{entity.id}</div>
          </div>

          {/* Attributes */}
          <div>
            <div className="text-xs text-muted mb-2">Attributes</div>
            <div className="space-y-1">
              {Object.entries(entity.attrs).map(([key, value]) => (
                <div key={key} className="text-sm">
                  <span className="text-muted">{key}:</span>{' '}
                  <span className="ml-2">{String(value)}</span>
                </div>
              ))}
              {Object.keys(entity.attrs).length === 0 && (
                <div className="text-sm text-muted">No attributes</div>
              )}
            </div>
          </div>

          {/* Outgoing Relationships */}
          {outgoingRels.length > 0 && (
            <div>
              <div className="text-xs text-muted mb-2">Outgoing Relationships</div>
              <div className="space-y-1">
                {outgoingRels.map((rel, idx) => (
                  <div key={idx} className="text-sm">
                    <span className="font-medium">{rel.type}</span>
                    {' → '}
                    <span className="text-muted">{rel.toId}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Incoming Relationships */}
          {incomingRels.length > 0 && (
            <div>
              <div className="text-xs text-muted mb-2">Incoming Relationships</div>
              <div className="space-y-1">
                {incomingRels.map((rel, idx) => (
                  <div key={idx} className="text-sm">
                    <span className="text-muted">{rel.fromId}</span>
                    {' → '}
                    <span className="font-medium">{rel.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Drawer>
  )
}
