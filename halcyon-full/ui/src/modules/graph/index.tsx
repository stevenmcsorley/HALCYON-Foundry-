import React from 'react'
import { Card } from '@/components/Card'
import { GraphCanvas } from './GraphCanvas'
import { useGraphData } from './useGraphData'

export const GraphPanel: React.FC = () => {
  const { graphData, loading, error } = useGraphData()

  return (
    <Card title="Graph">
      {loading && <div className="text-sm text-muted mb-2">Loading...</div>}
      {error && <div className="text-sm text-red-400 mb-2">Error: {error}</div>}
      <div className="h-48">
        {graphData.nodes.length === 0 && !loading ? (
          <div className="h-full rounded-lg bg-black/20 flex items-center justify-center text-muted text-sm">
            No graph data available
          </div>
        ) : (
          <GraphCanvas elements={graphData} />
        )}
      </div>
    </Card>
  )
}
