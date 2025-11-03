import { useEffect, useState } from 'react'
import { gql } from '@/services/api'

export function useHealth() {
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const Q = `query{ health }`
    gql<{health:string}>(Q).then(d=>setStatus(d.health)).catch(e=>setError(e.message))
  }, [])
  return { status, error }
}
