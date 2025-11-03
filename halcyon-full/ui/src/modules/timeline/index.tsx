import React from 'react'
import { Card } from '@/components/Card'

export const TimelinePanel: React.FC = () => {
  return (
    <Card title="Timeline">
      <div className="h-28 rounded-lg bg-black/20 flex items-center justify-center text-muted">
        Time range and playback controls go here
      </div>
    </Card>
  )
}
