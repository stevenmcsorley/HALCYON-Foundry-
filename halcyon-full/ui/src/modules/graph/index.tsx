import React, { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/Card'
import GraphCanvas from './GraphCanvas'
import { useLiveStore } from '@/store/liveStore'
import { useEntities } from '@/hooks/useEntities'
import { useGraphData, EntityTypeFilter, SeverityFilter, TimeWindow } from './useGraphData'

const NODE_CAP = 200

export const GraphPanel: React.FC = () => {
  const { onNewEntity } = useEntities()
  const { followLiveGraph, setFollowLiveGraph } = useLiveStore()
  const [latestEntity, setLatestEntity] = useState<any>(null)
  
  // Filter state
  const [entityTypeFilter, setEntityTypeFilter] = useState<EntityTypeFilter>('all')
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')
  const [timeWindowFilter, setTimeWindowFilter] = useState<TimeWindow>('all')
  const [nodeLimit, setNodeLimit] = useState(NODE_CAP)
  const [layout, setLayout] = useState<'breadthfirst' | 'cose'>('breadthfirst')
  const [showEdgeLabels, setShowEdgeLabels] = useState(true)

  useEffect(() => {
    onNewEntity((entity) => {
      setLatestEntity(entity)
    })
  }, [onNewEntity])

  // Reset node limit when filters change
  useEffect(() => {
    setNodeLimit(NODE_CAP)
  }, [entityTypeFilter, severityFilter, timeWindowFilter])

  const { elements, loading, error, hasMore } = useGraphData(
    {
      entityType: entityTypeFilter,
      severity: severityFilter,
      timeWindow: timeWindowFilter,
    },
    nodeLimit
  )

  const handleLoadMore = useCallback(() => {
    setNodeLimit(prev => prev + NODE_CAP)
  }, [])

  return (
    <Card title="Graph">
      {/* Toolbar with filters and controls */}
      <div className="px-3 py-2 border-b border-white/10 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm opacity-80">Graph</div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={followLiveGraph}
              onChange={(e) => setFollowLiveGraph(e.target.checked)}
              className="w-3 h-3"
            />
            Follow Live
          </label>
        </div>
        
        {/* Filter Controls */}
        <div className="flex flex-wrap gap-2 text-xs">
          {/* Entity Type Filter */}
          <select
            value={entityTypeFilter}
            onChange={(e) => setEntityTypeFilter(e.target.value as EntityTypeFilter)}
            className="px-2 py-1 rounded bg-white/10 border border-white/20 text-white"
          >
            <option value="all">All Types</option>
            <option value="Event">Events</option>
            <option value="Asset">Assets</option>
            <option value="Location">Locations</option>
            <option value="Anomaly">Anomalies</option>
          </select>

          {/* Severity Filter */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
            className="px-2 py-1 rounded bg-white/10 border border-white/20 text-white"
          >
            <option value="all">All Severities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>

          {/* Time Window Filter */}
          <select
            value={timeWindowFilter}
            onChange={(e) => setTimeWindowFilter(e.target.value as TimeWindow)}
            className="px-2 py-1 rounded bg-white/10 border border-white/20 text-white"
          >
            <option value="all">All Time</option>
            <option value="1h">Last 1h</option>
            <option value="6h">Last 6h</option>
            <option value="24h">Last 24h</option>
          </select>

          {/* Layout Switcher */}
          <select
            value={layout}
            onChange={(e) => setLayout(e.target.value as 'breadthfirst' | 'cose')}
            className="px-2 py-1 rounded bg-white/10 border border-white/20 text-white"
          >
            <option value="breadthfirst">Breadthfirst</option>
            <option value="cose">Cose</option>
          </select>

          {/* Edge Label Toggle */}
          <label className="flex items-center gap-1 px-2 py-1 rounded bg-white/10 border border-white/20 cursor-pointer">
            <input
              type="checkbox"
              checked={showEdgeLabels}
              onChange={(e) => setShowEdgeLabels(e.target.checked)}
              className="w-3 h-3"
            />
            Edge Labels
          </label>

          {/* Load More Button */}
          {hasMore && (
            <button
              onClick={handleLoadMore}
              className="px-2 py-1 rounded bg-teal-600 hover:bg-teal-700 text-white text-xs"
            >
              Load More ({elements.totalFiltered - nodeLimit} remaining)
            </button>
          )}
        </div>
      </div>

      {loading && <div className="text-sm text-muted mb-2 flex-shrink-0 p-3">Loading...</div>}
      {error && <div className="text-sm text-red-400 mb-2 flex-shrink-0 p-3">Error: {error}</div>}
      {!loading && (
        <div className="flex-1 min-h-0 p-3" style={{ position: 'relative', height: '100%' }}>
          <GraphCanvas
            elements={elements}
            followLive={followLiveGraph}
            latestEntity={latestEntity}
            layout={layout}
            showEdgeLabels={showEdgeLabels}
          />
        </div>
      )}
    </Card>
  )
}
