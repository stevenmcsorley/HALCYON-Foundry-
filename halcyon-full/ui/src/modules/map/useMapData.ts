import { useMemo } from 'react'
import { useEntities } from '@/hooks/useEntities'

type LocationEntity = {
  id: string
  type: string
  lat: number
  lon: number
  attrs: Record<string, any>
  name?: string
}

export function useMapData() {
  const { entities, loading, error } = useEntities()

  const locations = useMemo<LocationEntity[]>(() => {
    return entities
      .filter((e) => e.type === 'Location' && typeof e.attrs.lat === 'number' && typeof e.attrs.lon === 'number')
      .map((e) => ({
        id: e.id,
        type: e.type,
        lat: e.attrs.lat as number,
        lon: e.attrs.lon as number,
        attrs: e.attrs,
        name: typeof e.attrs.name === 'string' ? e.attrs.name : undefined
      }))
  }, [entities])

  return { locations, loading, error }
}
