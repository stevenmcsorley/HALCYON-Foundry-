import React from 'react'
import { Card } from '@/components/Card'
import { MapCanvas } from './MapCanvas'
import { useMapData } from './useMapData'

export const MapPanel: React.FC = () => {
  const { locations, loading, error } = useMapData()
  const mapStyleUrl = import.meta.env.VITE_MAP_STYLE_URL

  return (
    <Card title="Map">
      {loading && <div className="text-sm text-muted mb-2">Loading locations...</div>}
      {error && <div className="text-sm text-red-400 mb-2">Error: {error}</div>}
      <div className="h-64">
        {locations.length === 0 && !loading ? (
          <div className="h-full rounded-lg bg-black/20 flex items-center justify-center text-muted text-sm">
            No Location entities found
          </div>
        ) : (
          <MapCanvas locations={locations} mapStyleUrl={mapStyleUrl} />
        )}
      </div>
    </Card>
  )
}
