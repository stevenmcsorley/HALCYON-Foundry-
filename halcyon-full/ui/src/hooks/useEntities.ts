import { useEffect, useState, useRef } from 'react'
import { gql } from '@/services/api'
import { subscribe } from '@/services/websocket'

type Entity = {
  id: string
  type: string
  attrs: Record<string, any>
}

export function useEntities(type?: string) {
  const [entities, setEntities] = useState<Entity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const entitiesRef = useRef<Map<string, Entity>>(new Map())

  useEffect(() => {
    const fetchEntities = async () => {
      setLoading(true)
      setError(null)
      try {
        const Q = type 
          ? `query { entities(type: "${type}") { id type attrs } }`
          : `query { entities { id type attrs } }`
        const data = await gql<{ entities: Entity[] }>(Q)
        entitiesRef.current = new Map(data.entities.map(e => [e.id, e]))
        setEntities(data.entities)
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
        entitiesRef.current.set(entity.id, entity)
        const filtered = type ? Array.from(entitiesRef.current.values()).filter(e => e.type === type) : Array.from(entitiesRef.current.values())
        setEntities(filtered)
      }
    })

    return unsubscribe
  }, [type])

  return { entities, loading, error }
}
