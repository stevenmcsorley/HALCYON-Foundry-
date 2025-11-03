import React from 'react'
import { Card } from '@/components/Card'

export const GraphPanel: React.FC = () => {
  return (
    <Card title="Graph">
      <div className="h-48 rounded-lg bg-black/20 flex items-center justify-center text-muted">
        Graph placeholder (Cytoscape.js or custom canvas here)
      </div>
    </Card>
  )
}
