import React, { useEffect, useRef, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { onFocus } from '@/store/bus'
import { useSelectionStore } from '@/store/selectionStore'

type Loc = { id:string; lat:number; lon:number; attrs:any; type?:string }

export default function MapCanvas({ locations }:{ locations:Loc[] }) {
  const map = useRef<maplibregl.Map|null>(null)
  const wrap = useRef<HTMLDivElement|null>(null)
  const markers = useRef(new Map<string, maplibregl.Marker>())
  const setSel = useSelectionStore(s=>s.set)
  const styleUrl = import.meta.env.VITE_MAP_STYLE_URL ?? 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

  useEffect(() => {
    if (!wrap.current) return
    
    if (map.current) {
      // Map already exists, just resize it
      setTimeout(() => map.current?.resize(), 100)
      return
    }
    
    // Wait a bit for container to have dimensions
    const initMap = () => {
      if (!wrap.current) return
      map.current = new maplibregl.Map({ 
        container: wrap.current, 
        style: styleUrl, 
        center: [-4.25, 55.86], 
        zoom: 10 
      })
      map.current.addControl(new maplibregl.NavigationControl(), 'top-right')
    }
    
    // Try immediate init, fallback to timeout
    setTimeout(initMap, 50)
  }, [styleUrl])

  const renderMarkers = useCallback(() => {
    if (!map.current) return
    const seen = new Set<string>()
    locations.forEach(l => {
      seen.add(l.id)
      if (!markers.current.get(l.id)) {
        const el = document.createElement('div'); el.className = 'w-3 h-3 rounded-full bg-teal-400 border border-white/50'
        el.onclick = () => setSel({ id: l.id, type: l.type || 'Location' })
        const m = new maplibregl.Marker({ element: el }).setLngLat([l.lon, l.lat]).addTo(map.current!)
        markers.current.set(l.id, m)
      } else {
        markers.current.get(l.id)!.setLngLat([l.lon, l.lat])
      }
    })
    // cleanup
    for (const [id, m] of markers.current) if (!seen.has(id)) { m.remove(); markers.current.delete(id) }
  }, [locations, setSel])

  useEffect(() => {
    const t = setTimeout(renderMarkers, 150)
    return () => clearTimeout(t)
  }, [renderMarkers])

  useEffect(() => {
    const unsubscribe = onFocus(({ id }) => {
      if (!map.current) return
      
      // First try to find an existing marker
      const m = markers.current.get(id)
      if (m) {
        const lngLat = m.getLngLat()
        map.current.flyTo({
          center: [lngLat.lng, lngLat.lat],
          zoom: 12,
          duration: 1500
        })
        return
      }
      
      // If no marker exists, check if entity is in locations array
      const loc = locations.find(l => l.id === id)
      if (loc) {
        map.current.flyTo({
          center: [loc.lon, loc.lat],
          zoom: 12,
          duration: 1500
        })
      }
    })
    return unsubscribe
  }, [locations])

  return <div ref={wrap} className="w-full h-full rounded-lg overflow-hidden" style={{ minHeight: 0 }} />
}
