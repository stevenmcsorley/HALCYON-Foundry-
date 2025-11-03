import React from 'react'
import { Card } from '@/components/Card'
import { useHealth } from '@/hooks/useHealth'

export const MapPanel: React.FC = () => {
  const { status, error } = useHealth()
  return (
    <Card title="Map">
      <div className="text-sm text-muted mb-2">Gateway health: {error ? 'error' : status}</div>
      <div className="h-64 rounded-lg bg-black/20 flex items-center justify-center text-muted">
        Map placeholder (deck.gl or MapLibre can be wired here)
      </div>
    </Card>
  )
}
