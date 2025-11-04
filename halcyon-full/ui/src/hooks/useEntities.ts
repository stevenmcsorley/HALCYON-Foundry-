import { useEffect, useState, useRef, useCallback } from 'react'
import { subscribe } from '@/services/websocket'

type Entity = {
  id: string
  type: string
  attrs: Record<string, any>
}

const MAX_ENTITIES = 1000 // Cap to prevent memory issues

export function useEntities(
  type?: string,
  sort: string = 'timestamp',
  order: 'asc' | 'desc' = 'desc',
  limit?: number
) {
  const [entities, setEntities] = useState<Entity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const entitiesRef = useRef<Map<string, Entity>>(new Map())
  const onNewEntityRef = useRef<((entity: Entity) => void) | null>(null)

  // Expose callback for Follow Live mode
  const onNewEntity = useCallback((callback: (entity: Entity) => void) => {
    onNewEntityRef.current = callback
  }, [])

  useEffect(() => {
    const fetchEntities = async () => {
      setLoading(true)
      setError(null)
      try {
        // Use REST API for sorting support
        const params = new URLSearchParams()
        if (type) params.set('entity_type', type)
        params.set('sort', sort)
        params.set('order', order)
        if (limit) params.set('limit', limit.toString())
        
        const ontologyUrl = import.meta.env.VITE_ONTOLOGY_URL || 'http://localhost:8081'
        const response = await fetch(`${ontologyUrl}/entities?${params}`)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data: Entity[] = await response.json()
        
        // Store entities in map and sort
        entitiesRef.current = new Map(data.map(e => [e.id, e]))
        const sorted = Array.from(entitiesRef.current.values())
        
        // Sort by timestamp if available (newest first by default)
        sorted.sort((a, b) => {
          const aTs = a.attrs?.timestamp || ''
          const bTs = b.attrs?.timestamp || ''
          if (order === 'desc') {
            return bTs.localeCompare(aTs)
          }
          return aTs.localeCompare(bTs)
        })
        
        // Apply limit if needed
        const limited = limit ? sorted.slice(0, limit) : sorted.slice(0, MAX_ENTITIES)
        setEntities(limited)
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    fetchEntities()

    const unsubscribe = subscribe((msg) => {
      if (msg.t === 'entity.upsert' && msg.data) {
        const entity = msg.data as Entity
        
        // Filter by type if specified
        if (type && entity.type !== type) return
        
        // Update or add entity
        entitiesRef.current.set(entity.id, entity)
        
        // Convert to array and sort (newest first)
        const all = Array.from(entitiesRef.current.values())
        all.sort((a, b) => {
          const aTs = a.attrs?.timestamp || ''
          const bTs = b.attrs?.timestamp || ''
          if (order === 'desc') {
            return bTs.localeCompare(aTs)
          }
          return aTs.localeCompare(bTs)
        })
        
        // Cap length
        const limited = limit ? all.slice(0, limit) : all.slice(0, MAX_ENTITIES)
        setEntities(limited)
        
        // Notify Follow Live subscribers
        if (onNewEntityRef.current) {
          onNewEntityRef.current(entity)
        }
      }
    })

    return unsubscribe
  }, [type, sort, order, limit])

  return { entities, loading, error, onNewEntity }
}
