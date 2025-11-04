import React, { useEffect, useRef, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useSelectionStore } from '@/store/selectionStore'

type LocationEntity = {
  id: string
  lat: number
  lon: number
  name?: string
}

type MapCanvasProps = {
  locations: LocationEntity[]
  mapStyleUrl?: string
}

export const MapCanvas: React.FC<MapCanvasProps> = ({ locations, mapStyleUrl }) => {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const { setSelectedEntity } = useSelectionStore()

  useEffect(() => {
    if (!mapContainer.current || map.current) return

    const defaultStyle = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
    const styleUrl = mapStyleUrl || import.meta.env.VITE_MAP_STYLE_URL || defaultStyle

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: styleUrl,
      center: [0, 0],
      zoom: 2
    })

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right')

    return () => {
      if (map.current) {
        map.current.remove()
        map.current = null
      }
    }
  }, [mapStyleUrl])

  // Debounced marker update function
  const updateMarkers = useCallback(() => {
    if (!map.current) return

    // Clear existing markers
    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current = []

    // Add markers for each location
    locations.forEach((location) => {
      const el = document.createElement('div')
      el.className = 'w-4 h-4 bg-accent rounded-full border-2 border-white cursor-pointer'
      el.style.cursor = 'pointer'
      el.title = location.name || location.id

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([location.lon, location.lat])
        .addTo(map.current!)

      el.addEventListener('click', () => {
        setSelectedEntity({ id: location.id, type: 'Location' })
      })

      markersRef.current.push(marker)
    })

    // Fit map to bounds if there are locations
    if (locations.length > 0) {
      const bounds = new maplibregl.LngLatBounds()
      locations.forEach((loc) => bounds.extend([loc.lon, loc.lat]))
      map.current.fitBounds(bounds, { padding: 50, maxZoom: 12 })
    }
  }, [locations, setSelectedEntity])

  useEffect(() => {
    // Debounce marker updates on stream updates (200ms delay)
    const timeoutId = setTimeout(() => {
      updateMarkers()
    }, 200)

    return () => clearTimeout(timeoutId)
  }, [updateMarkers])

  return <div ref={mapContainer} className="w-full h-full rounded-lg overflow-hidden" />
}
