import React from 'react'
import { Card } from '@/components/Card'
import { useEntities } from '@/hooks/useEntities'
import { useSelectionStore } from '@/store/selectionStore'

export const ListPanel: React.FC = () => {
  const { entities, loading, error } = useEntities()
  const { setSelectedEntity } = useSelectionStore()

  const handleEntityClick = (entity: { id: string; type: string }) => {
    setSelectedEntity({ id: entity.id, type: entity.type })
  }

  return (
    <Card title="Entities">
      {loading && <div className="text-sm text-muted">Loading...</div>}
      {error && <div className="text-sm text-red-400">Error: {error}</div>}
      {!loading && !error && (
        <ul className="space-y-2 text-sm">
          {entities.length === 0 ? (
            <li className="opacity-70">No entities found. Run the seed script to add sample data.</li>
          ) : (
            entities.map((entity) => (
              <li
                key={entity.id}
                className="p-2 rounded bg-black/20 hover:bg-black/30 cursor-pointer transition-colors"
                onClick={() => handleEntityClick(entity)}
              >
                <div className="font-medium">{entity.type}: {entity.id}</div>
                <div className="text-xs text-muted mt-1">
                  {Object.entries(entity.attrs).map(([key, value]) => (
                    <div key={key}>{key}: {String(value)}</div>
                  ))}
                </div>
              </li>
            ))
          )}
        </ul>
      )}
    </Card>
  )
}
