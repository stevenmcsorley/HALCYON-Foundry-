import { useEffect, useState } from 'react'
import { gql } from '@/services/api'

type Entity = {
  id: string
  type: string
  attrs: Record<string, any>
  neighbors?: Array<{
    id: string
    type: string
    relType: string
    isOutgoing: boolean
  }>
}

export function useEntity(entityId: string | null) {
  const [entity, setEntity] = useState<Entity | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!entityId) {
      setEntity(null)
      setLoading(false)
      setError(null)
      return
    }

    const fetchEntity = async () => {
      setLoading(true)
      setError(null)
      try {
        const Q = `query($id: ID!) { entityById(id: $id) { id type attrs neighbors { id type relType isOutgoing } } }`
        const data = await gql<{ entityById: Entity }>(Q, { id: entityId })
        setEntity(data.entityById)
      } catch (e: any) {
        setError(e.message)
        setEntity(null)
      } finally {
        setLoading(false)
      }
    }

    fetchEntity()
  }, [entityId])

  return { entity, loading, error }
}
