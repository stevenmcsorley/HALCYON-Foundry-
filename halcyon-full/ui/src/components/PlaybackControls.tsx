import React from 'react'
import { usePlaybackStore } from '@/store/playbackStore'

export default function PlaybackControls() {
  const { playing, speed, pause, play, seek, setSpeed, cursor, rangeStart, rangeEnd } = usePlaybackStore()

  const handleSpeedChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSpeed(parseFloat(e.target.value))
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (rangeStart && rangeEnd) {
      const start = new Date(rangeStart).getTime()
      const end = new Date(rangeEnd).getTime()
      const progress = parseFloat(e.target.value) / 100
      const newTime = new Date(start + (end - start) * progress)
      seek(newTime.toISOString())
    }
  }

  const getProgress = (): number => {
    if (!cursor || !rangeStart || !rangeEnd) return 0
    const start = new Date(rangeStart).getTime()
    const end = new Date(rangeEnd).getTime()
    const current = new Date(cursor).getTime()
    if (end === start) return 0
    return ((current - start) / (end - start)) * 100
  }

  return (
    <div className="bg-panel rounded-lg p-3 border border-white/10">
      <div className="flex items-center gap-3">
        <button
          onClick={playing ? pause : play}
          className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded transition-colors"
        >
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>
        
        <div className="flex items-center gap-2">
          <label className="text-sm opacity-80">Speed:</label>
          <select
            value={speed}
            onChange={handleSpeedChange}
            className="px-2 py-1 bg-black/20 border border-white/10 rounded text-sm"
          >
            <option value={0.25}>0.25x</option>
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={4}>4x</option>
          </select>
        </div>

        {cursor && (
          <div className="text-sm opacity-60">
            {new Date(cursor).toLocaleString()}
          </div>
        )}

        {rangeStart && rangeEnd && (
          <div className="flex-1">
            <input
              type="range"
              min="0"
              max="100"
              value={getProgress()}
              onChange={handleSeek}
              className="w-full"
            />
          </div>
        )}
      </div>
    </div>
  )
}
