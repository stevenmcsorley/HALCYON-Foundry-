import React from 'react'
import { Card } from '@/components/Card'

export const ListPanel: React.FC = () => {
  return (
    <Card title="Events">
      <ul className="space-y-2 text-sm">
        <li className="opacity-70">Live events will appear here (subscribe via WS)</li>
      </ul>
    </Card>
  )
}
