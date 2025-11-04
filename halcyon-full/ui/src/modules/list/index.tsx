import React from 'react'
import { Card } from '@/components/Card'
import { useEntities } from '@/hooks/useEntities'
import { useSelectionStore } from '@/store/selectionStore'

export const ListPanel: React.FC = () => {
  const { entities, loading, error } = useEntities()
  const setSel = useSelectionStore(s => s.set)

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
                className="p-2 rounded bg-black/20 cursor-pointer hover:bg-black/40 transition-colors"
                onClick={() => setSel({ id: entity.id, type: entity.type })}
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
