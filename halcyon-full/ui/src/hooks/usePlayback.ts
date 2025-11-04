import { useEffect, useRef } from 'react'
import { usePlaybackStore } from '@/store/playbackStore'

export function usePlayback() {
  const { playing, speed, cursor, rangeStart, rangeEnd, seek, pause } = usePlaybackStore()
  const lastTimeRef = useRef<number>(Date.now())

  useEffect(() => {
    if (!playing || !cursor || !rangeStart || !rangeEnd) {
      lastTimeRef.current = Date.now()
      return
    }

    const start = new Date(rangeStart).getTime()
    const end = new Date(rangeEnd).getTime()
    const current = new Date(cursor).getTime()

    if (current >= end) {
      pause()
      return
    }

    const timer = setInterval(() => {
      const now = Date.now()
      const realElapsed = (now - lastTimeRef.current) / 1000 // seconds
      lastTimeRef.current = now

      const playbackElapsed = realElapsed * speed // seconds
      const newTime = current + playbackElapsed * 1000 // milliseconds

      if (newTime >= end) {
        seek(new Date(end).toISOString())
        pause()
      } else {
        seek(new Date(newTime).toISOString())
      }
    }, 100) // Update every 100ms for smooth playback

    return () => clearInterval(timer)
  }, [playing, speed, cursor, rangeStart, rangeEnd, seek, pause])
}
