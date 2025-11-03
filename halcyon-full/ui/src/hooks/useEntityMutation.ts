import { useCallback, useState } from 'react'
import { gql } from '@/services/api'

export function useEntityMutation() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const upsert = useCallback(async (input: any[]) => {
    setLoading(true); setError(null)
    try {
      const Q = `mutation($input:[EntityInput!]!){ upsertEntities(input:$input) }`
      const res = await gql<{ upsertEntities: boolean }>(Q, { input })
      return res.upsertEntities
    } catch (e:any) { setError(e); return false }
    finally { setLoading(false) }
  }, [])
  return { upsert, loading, error }
}
