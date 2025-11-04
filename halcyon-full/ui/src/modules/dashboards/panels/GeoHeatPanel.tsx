import React, { useEffect, useRef } from 'react'
// @ts-ignore
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

interface GeoHeatPanelProps {
  data: any
  config?: {
    latKey?: string // default: "lat"
    lonKey?: string // default: "lon"
    intensityKey?: string // default: "intensity" or constant 1
    styleUrl?: string
  }
}

export const GeoHeatPanel: React.FC<GeoHeatPanelProps> = ({ data, config }) => {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const styleUrl = config?.styleUrl || import.meta.env.VITE_MAP_STYLE_URL || 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

  useEffect(() => {
    if (!mapContainer.current || map.current) return

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: styleUrl,
      center: [0, 20],
      zoom: 2
    })

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right')

    return () => {
      if (map.current) {
        map.current.remove()
        map.current = null
      }
    }
  }, [styleUrl])

  useEffect(() => {
    if (!map.current || !data) return

    // Extract coordinates from data
    const latKey = config?.latKey || 'lat'
    const lonKey = config?.lonKey || 'lon'
    const intensityKey = config?.intensityKey

    let points: Array<[number, number, number]> = []

    // Try to find coordinates in data
    const extractPoints = (obj: any): void => {
      if (Array.isArray(obj)) {
        obj.forEach(item => extractPoints(item))
      } else if (obj && typeof obj === 'object') {
        if (typeof obj[latKey] === 'number' && typeof obj[lonKey] === 'number') {
          const intensity = intensityKey && typeof obj[intensityKey] === 'number' 
            ? obj[intensityKey] 
            : (obj.intensity || 1)
          points.push([obj[lonKey], obj[latKey], intensity])
        } else {
          Object.values(obj).forEach(val => {
            if (val && typeof val === 'object') {
              extractPoints(val)
            }
          })
        }
      }
    }

    extractPoints(data)

    if (points.length === 0) return

    // Create GeoJSON source
    const geojson = {
      type: 'FeatureCollection' as const,
      features: points.map(([lon, lat, intensity]) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [lon, lat]
        },
        properties: {
          intensity
        }
      }))
    }

    // Remove existing heat layer if present
    const existingSource = map.current.getSource('heat-source')
    if (existingSource) {
      if (map.current.getLayer('heat-layer')) {
        map.current.removeLayer('heat-layer')
      }
      map.current.removeSource('heat-source')
    }

    // Add heat source and layer
    map.current.addSource('heat-source', {
      type: 'geojson',
      data: geojson
    })

    map.current.addLayer({
      id: 'heat-layer',
      type: 'heatmap',
      source: 'heat-source',
      maxzoom: 15,
      paint: {
        'heatmap-weight': {
          property: 'intensity',
          type: 'exponential',
          stops: [[0, 0], [1, 1]]
        },
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0, 'rgba(33,102,172,0)',
          0.2, 'rgb(103,169,207)',
          0.4, 'rgb(209,229,240)',
          0.6, 'rgb(253,219,199)',
          0.8, 'rgb(239,138,98)',
          1, 'rgb(178,24,43)'
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 9, 20],
        'heatmap-opacity': 0.6
      }
    })

    // Fit bounds to points
    if (points.length > 0) {
      const bounds = new maplibregl.LngLatBounds()
      points.forEach(([lon, lat]) => bounds.extend([lon, lat]))
      map.current.fitBounds(bounds, { padding: 50, duration: 1000 })
    }
  }, [data, config, map.current])

  return (
    <div className="w-full h-full rounded-lg overflow-hidden relative" style={{ minHeight: '300px' }}>
      <div ref={mapContainer} className="w-full h-full" />
      {!data && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white/70">
          No coordinate data available
        </div>
      )}
    </div>
  )
}
