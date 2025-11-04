import { create } from 'zustand'

type Sel = { id?: string; type?: string }

type S = Sel & { set: (s: Sel) => void; clear: () => void }

export const useSelectionStore = create<S>((set) => ({
  id: undefined, type: undefined,
  set: (s) => set(s),
  clear: () => set({ id: undefined, type: undefined })
}))
