import React, { useMemo, useState, useEffect } from 'react'
import { Card } from '@/components/Card'
import MapCanvas from './MapCanvas'
import { useEntities } from '@/hooks/useEntities'
import { useLiveStore } from '@/store/liveStore'

export const MapPanel: React.FC = () => {
  const { entities, loading, error, onNewEntity } = useEntities()
  const { followLiveMap, setFollowLiveMap } = useLiveStore()
  const [latestEntity, setLatestEntity] = useState<any>(null)

  useEffect(() => {
    onNewEntity((entity) => {
      setLatestEntity(entity)
    })
  }, [onNewEntity])

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
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="text-sm opacity-80">Map</div>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={followLiveMap}
            onChange={(e) => setFollowLiveMap(e.target.checked)}
            className="w-3 h-3"
          />
          Follow Live
        </label>
      </div>
      {loading && <div className="text-sm text-muted mb-2 flex-shrink-0 p-3">Loading...</div>}
      {error && <div className="text-sm text-red-400 mb-2 flex-shrink-0 p-3">Error: {error}</div>}
      {!loading && !error && (
        <div className="flex-1 min-h-0 p-3 flex flex-col">
          <MapCanvas locations={locations} followLive={followLiveMap} latestEntity={latestEntity} />
        </div>
      )}
    </Card>
  )
}
