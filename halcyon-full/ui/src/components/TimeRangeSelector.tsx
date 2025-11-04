import React, { useState } from 'react'
import { usePlaybackStore } from '@/store/playbackStore'

export default function TimeRangeSelector() {
  const { rangeStart, rangeEnd, setRange } = usePlaybackStore()
  const [start, setStart] = useState(rangeStart ? rangeStart.slice(0, 16) : '')
  const [end, setEnd] = useState(rangeEnd ? rangeEnd.slice(0, 16) : '')

  const handleApply = () => {
    const startISO = start ? new Date(start).toISOString() : null
    const endISO = end ? new Date(end).toISOString() : null
    setRange(startISO, endISO)
  }

  return (
    <div className="bg-panel rounded-lg p-3 border border-white/10">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm opacity-80">From:</label>
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="px-2 py-1 bg-black/20 border border-white/10 rounded text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm opacity-80">To:</label>
          <input
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="px-2 py-1 bg-black/20 border border-white/10 rounded text-sm"
          />
        </div>
        <button
          onClick={handleApply}
          className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition-colors"
        >
          Set Range
        </button>
      </div>
    </div>
  )
}
