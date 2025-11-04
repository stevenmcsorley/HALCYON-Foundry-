import React, { useState, useMemo } from 'react'
import { Card } from '@/components/Card'
import { useEntities } from '@/hooks/useEntities'
import { useSelectionStore } from '@/store/selectionStore'

const ITEMS_PER_PAGE = 20

export const ListPanel: React.FC = () => {
  const { entities, loading, error } = useEntities()
  const setSel = useSelectionStore(s => s.set)
  const [currentPage, setCurrentPage] = useState(1)

  const paginatedEntities = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return entities.slice(start, start + ITEMS_PER_PAGE)
  }, [entities, currentPage])

  const totalPages = Math.ceil(entities.length / ITEMS_PER_PAGE)

  return (
    <Card title="Entities">
      {loading && <div className="text-sm text-muted flex-shrink-0 p-3">Loading...</div>}
      {error && <div className="text-sm text-red-400 flex-shrink-0 p-3">Error: {error}</div>}
      {!loading && !error && (
        <>
          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            <ul className="space-y-2 text-sm">
              {paginatedEntities.length === 0 ? (
                <li className="opacity-70">No entities found. Run the seed script to add sample data.</li>
              ) : (
                paginatedEntities.map((entity) => (
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
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 border-t border-white/10 flex-shrink-0">
              <div className="text-xs text-muted">
                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, entities.length)} of {entities.length}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2 py-1 text-xs rounded bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Prev
                </button>
                <span className="px-2 py-1 text-xs opacity-70">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2 py-1 text-xs rounded bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  )
}
