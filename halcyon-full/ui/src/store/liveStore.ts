import { create } from 'zustand'

interface LiveStore {
  followLiveMap: boolean
  followLiveGraph: boolean
  setFollowLiveMap: (value: boolean) => void
  setFollowLiveGraph: (value: boolean) => void
}

export const useLiveStore = create<LiveStore>((set) => ({
  followLiveMap: false,
  followLiveGraph: false,
  setFollowLiveMap: (value) => set({ followLiveMap: value }),
  setFollowLiveGraph: (value) => set({ followLiveGraph: value }),
}))
