import { create } from 'zustand'

type PlaybackState = {
  playing: boolean
  speed: number // multiplier (1x, 2x, 0.5x, etc.)
  cursor: string | null // ISO timestamp
  rangeStart: string | null
  rangeEnd: string | null
  setRange: (start: string | null, end: string | null) => void
  play: () => void
  pause: () => void
  seek: (ts: string) => void
  setSpeed: (speed: number) => void
}

export const usePlaybackStore = create<PlaybackState>((set) => ({
  playing: false,
  speed: 1,
  cursor: null,
  rangeStart: null,
  rangeEnd: null,
  setRange: (start, end) => set({ rangeStart: start, rangeEnd: end, cursor: start }),
  play: () => set({ playing: true }),
  pause: () => set({ playing: false }),
  seek: (ts) => set({ cursor: ts }),
  setSpeed: (speed) => set({ speed }),
}))
