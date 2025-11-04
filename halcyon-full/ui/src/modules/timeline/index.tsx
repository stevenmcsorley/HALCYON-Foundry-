import React from 'react'
import { Card } from '@/components/Card'
import { useTimelineCounts } from '@/hooks/useTimelineCounts'
import { usePlaybackStore } from '@/store/playbackStore'
import PlaybackControls from '@/components/PlaybackControls'
import TimeRangeSelector from '@/components/TimeRangeSelector'
import { usePlayback } from '@/hooks/usePlayback'

export const TimelinePanel: React.FC = () => {
  usePlayback() // Start playback loop if playing
  const { cursor } = usePlaybackStore()
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
      <div className="space-y-3">
        <TimeRangeSelector />
        <PlaybackControls />
        <div className="h-28 rounded-lg bg-black/20 p-3 relative">
          {cursor && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-yellow-400 z-10"
              style={{
                left: `${(() => {
                  if (!data.length) return 0
                  const cursorTime = new Date(cursor).getTime()
                  const firstTime = new Date(data[0].ts).getTime()
                  const lastTime = new Date(data[data.length - 1].ts).getTime()
                  if (lastTime === firstTime) return 0
                  const progress = ((cursorTime - firstTime) / (lastTime - firstTime)) * 100
                  return Math.max(0, Math.min(100, progress))
                })()}%`,
              }}
            />
          )}
          {data.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted text-sm">
              No event data
            </div>
          ) : (
            <div className="h-full flex items-end gap-[2px] relative">
              {data.map((bucket, idx) => {
                const heightPercent = maxCount > 0 ? (bucket.c / maxCount) * 100 : 0
                const bucketTime = new Date(bucket.ts).getTime()
                const isAtCursor = cursor && Math.abs(new Date(cursor).getTime() - bucketTime) < 3600000 // Within 1 hour
                return (
                  <div
                    key={idx}
                    className={`flex-1 rounded-t-sm transition-all cursor-pointer ${
                      isAtCursor ? 'bg-yellow-500/80 hover:bg-yellow-400' : 'bg-teal-500/80 hover:bg-teal-400'
                    }`}
                    style={{ 
                      height: `${Math.max(heightPercent, bucket.c > 0 ? 10 : 0)}%`,
                      minWidth: data.length > 20 ? '1px' : '2px',
                      maxWidth: data.length === 1 ? '20%' : 'none'
                    }}
                    title={`${bucket.ts}: ${bucket.c} event${bucket.c !== 1 ? 's' : ''}`}
                    onClick={() => {
                      const { seek } = usePlaybackStore.getState()
                      seek(new Date(bucket.ts).toISOString())
                    }}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
