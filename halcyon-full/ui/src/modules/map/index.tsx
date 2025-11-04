import React, { useMemo } from 'react'
import { Card } from '@/components/Card'
import MapCanvas from './MapCanvas'
import { useEntities } from '@/hooks/useEntities'

export const MapPanel: React.FC = () => {
  const { entities, loading, error } = useEntities()

  const locations = useMemo(() => {
    // Show ALL entities with lat/lon (not just Location type)
    return entities
      .filter((e) => typeof e.attrs.lat === 'number' && typeof e.attrs.lon === 'number')
      .map((e) => ({
        id: e.id,
        lat: e.attrs.lat as number,
        lon: e.attrs.lon as number,
        attrs: e.attrs,
        type: e.type
      }))
  }, [entities])

  return (
    <Card title="Map">
      {loading && <div className="text-sm text-muted mb-2 flex-shrink-0 p-3">Loading...</div>}
      {error && <div className="text-sm text-red-400 mb-2 flex-shrink-0 p-3">Error: {error}</div>}
      {!loading && !error && (
        <div className="flex-1 min-h-0 p-3">
          <MapCanvas locations={locations} />
        </div>
      )}
    </Card>
  )
}
