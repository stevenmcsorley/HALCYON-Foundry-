import { useEffect, useRef } from 'react'
import { wsClient } from '@/services/websocket'

type Entity = {
  id: string
  type: string
  attrs: Record<string, unknown>
}

type Relationship = {
  type: string
  fromId: string
  toId: string
  attrs: Record<string, unknown>
}

type StreamCallback = {
  onEntityUpserted?: (entity: Entity) => void
  onRelationshipUpserted?: (relationship: Relationship) => void
}

export function useEntityStream(callbacks: StreamCallback) {
  const callbacksRef = useRef(callbacks)

  useEffect(() => {
    callbacksRef.current = callbacks
  }, [callbacks])

  useEffect(() => {
    const unsubscribe = wsClient.subscribe((message) => {
      if (message.t === 'entity.upsert' && message.data) {
        callbacksRef.current.onEntityUpserted?.(message.data)
      } else if (message.t === 'relationship.upsert' && message.data) {
        callbacksRef.current.onRelationshipUpserted?.(message.data)
      }
    })

    return unsubscribe
  }, [])
}
