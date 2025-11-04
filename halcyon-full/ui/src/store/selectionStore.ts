import { create } from 'zustand'

type SelectedEntity = {
  id: string
  type: string
} | null

type SelectionStore = {
  selectedEntity: SelectedEntity
  setSelectedEntity: (entity: SelectedEntity) => void
  clearSelection: () => void
}

export const useSelectionStore = create<SelectionStore>((set) => ({
  selectedEntity: null,
  setSelectedEntity: (entity) => set({ selectedEntity: entity }),
  clearSelection: () => set({ selectedEntity: null })
}))
