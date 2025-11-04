import { useEffect, useState } from 'react'
import { gql } from '@/services/api'

type Relationship = {
  type: string
  fromId: string
  toId: string
  attrs: Record<string, any>
}

export function useFilteredRelationships(
  fromId: string | null = null,
  toId: string | null = null,
  relType: string | null = null
) {
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchRelationships = async () => {
      setLoading(true)
      setError(null)
      try {
        const variables: Record<string, string> = {}
        const varDefs: string[] = []
        const filters: string[] = []
        
        if (fromId) {
          variables.fromId = fromId
          varDefs.push('$fromId: ID!')
          filters.push('fromId: $fromId')
        }
        if (toId) {
          variables.toId = toId
          varDefs.push('$toId: ID!')
          filters.push('toId: $toId')
        }
        if (relType) {
          variables.type = relType
          varDefs.push('$type: String!')
          filters.push('type: $type')
        }

        const filterStr = filters.length > 0 ? `(${filters.join(', ')})` : ''
        const varStr = varDefs.length > 0 ? `(${varDefs.join(', ')})` : ''
        const Q = `query${varStr} { relationships${filterStr} { type fromId toId attrs } }`
        
        const data = await gql<{ relationships: Relationship[] }>(Q, Object.keys(variables).length > 0 ? variables : undefined)
        setRelationships(data.relationships)
      } catch (e: any) {
        setError(e.message)
        setRelationships([])
      } finally {
        setLoading(false)
      }
    }

    fetchRelationships()
  }, [fromId, toId, relType])

  return { relationships, loading, error }
}
