import { useEffect, useState } from 'react'

type BucketData = {
  ts: string
  c: number
}

export function useTimelineCounts(bucket: 'minute' | 'hour' | 'day' = 'hour') {
  const [data, setData] = useState<BucketData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    
    const ontologyUrl = import.meta.env.VITE_ONTOLOGY_URL || 'http://localhost:8081'
    fetch(`${ontologyUrl}/events/counts?bucket=${bucket}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d) => {
        setData(d)
        setLoading(false)
      })
      .catch((e) => {
        setError(String(e))
        setLoading(false)
      })
  }, [bucket])

  return { data, loading, error }
}
