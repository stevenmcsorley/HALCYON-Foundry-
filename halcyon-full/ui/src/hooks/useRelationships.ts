import { useEffect, useState } from 'react'
import { gql } from '@/services/api'
import { useEntityStream } from './useEntityStream'

type Relationship = {
  type: string
  fromId: string
  toId: string
  attrs: Record<string, any>
}

export function useRelationships() {
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchRelationships = async () => {
      setLoading(true)
      setError(null)
      try {
        const Q = `query { relationships { type fromId toId attrs } }`
        const data = await gql<{ relationships: Relationship[] }>(Q)
        setRelationships(data.relationships)
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    fetchRelationships()
  }, [])

  // Subscribe to real-time updates
  useEntityStream({
    onRelationshipUpserted: (relationship) => {
      setRelationships((prev) => {
        const existingIndex = prev.findIndex(
          (r) => r.fromId === relationship.fromId && r.toId === relationship.toId && r.type === relationship.type
        )
        if (existingIndex >= 0) {
          const updated = [...prev]
          updated[existingIndex] = relationship
          return updated
        }
        return [...prev, relationship]
      })
    }
  })

  return { relationships, loading, error }
}
