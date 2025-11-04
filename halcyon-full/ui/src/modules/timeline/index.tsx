import React from 'react'
import { Card } from '@/components/Card'
import { useTimelineCounts } from '@/hooks/useTimelineCounts'

export const TimelinePanel: React.FC = () => {
  const { data, loading, error } = useTimelineCounts('hour')

  if (loading) {
    return (
      <Card title="Timeline">
        <div className="h-28 rounded-lg bg-black/20 flex items-center justify-center text-muted">
          Loading...
        </div>
      </Card>
    )
  }

  if (error) {
    return (
      <Card title="Timeline">
        <div className="h-28 rounded-lg bg-black/20 flex items-center justify-center text-red-400 text-sm">
          Error: {error}
        </div>
      </Card>
    )
  }

  const maxCount = data.length > 0 ? Math.max(...data.map((d) => d.c)) : 1

  return (
    <Card title="Timeline">
      <div className="h-28 rounded-lg bg-black/20 p-3">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted text-sm">
            No event data
          </div>
        ) : (
          <div className="h-full flex items-end gap-[2px]">
            {data.map((bucket, idx) => {
              const heightPercent = maxCount > 0 ? (bucket.c / maxCount) * 100 : 0
              return (
                <div
                  key={idx}
                  className="flex-1 bg-teal-500/80 hover:bg-teal-400 rounded-t-sm transition-all cursor-pointer"
                  style={{ 
                    height: `${Math.max(heightPercent, bucket.c > 0 ? 10 : 0)}%`,
                    minWidth: data.length > 20 ? '1px' : '2px',
                    maxWidth: data.length === 1 ? '20%' : 'none'
                  }}
                  title={`${bucket.ts}: ${bucket.c} event${bucket.c !== 1 ? 's' : ''}`}
                />
              )
            })}
          </div>
        )}
      </div>
    </Card>
  )
}
