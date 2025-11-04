import { useEffect, useState, useRef } from 'react'
import { gql } from '@/services/api'
import { subscribe } from '@/services/websocket'

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
  const relsRef = useRef<Map<string, Relationship>>(new Map())

  useEffect(() => {
    const fetchRelationships = async () => {
      setLoading(true)
      setError(null)
      try {
        const Q = `query { relationships { type fromId toId attrs } }`
        const data = await gql<{ relationships: Relationship[] }>(Q)
        relsRef.current = new Map(data.relationships.map((r, idx) => [`${r.fromId}-${r.type}-${r.toId}`, r]))
        setRelationships(data.relationships)
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    fetchRelationships()

    const unsubscribe = subscribe((msg) => {
      if (msg.t === 'relationship.upsert' && msg.data) {
        const rel = msg.data as Relationship
        const key = `${rel.fromId}-${rel.type}-${rel.toId}`
        relsRef.current.set(key, rel)
        setRelationships(Array.from(relsRef.current.values()))
      }
    })

    return unsubscribe
  }, [])

  return { relationships, loading, error }
}
