import { useEffect, useState } from 'react'
import { gql } from '@/services/api'
import { useEntityStream } from './useEntityStream'

type Entity = {
  id: string
  type: string
  attrs: Record<string, any>
}

export function useEntities(type?: string) {
  const [entities, setEntities] = useState<Entity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchEntities = async () => {
      setLoading(true)
      setError(null)
      try {
        const Q = type 
          ? `query { entities(type: "${type}") { id type attrs } }`
          : `query { entities { id type attrs } }`
        const data = await gql<{ entities: Entity[] }>(Q)
        setEntities(data.entities)
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    fetchEntities()
  }, [type])

  // Subscribe to real-time updates
  useEntityStream({
    onEntityUpserted: (entity) => {
      setEntities((prev) => {
        const existingIndex = prev.findIndex((e) => e.id === entity.id)
        if (existingIndex >= 0) {
          const updated = [...prev]
          updated[existingIndex] = entity
          return updated
        }
        return [...prev, entity]
      })
    }
  })

  return { entities, loading, error }
}
