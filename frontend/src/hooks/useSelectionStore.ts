// shared/stores/useSelectionStore.ts
import { create } from "zustand";

interface SelectionState {
  selectedIds: Set<string>;
  isSelecting: boolean;
  toggle: (id: string) => void;
  selectAll: (ids: string[]) => void;
  setSelecting: (selecting: boolean) => void;
  clear: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedIds: new Set(),
  isSelecting: false,
  toggle: (id) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedIds: next, isSelecting: next.size > 0 };
    }),
  selectAll: (ids) => set({ selectedIds: new Set(ids), isSelecting: ids.length > 0 }),
  setSelecting: (selecting) =>
    set((state) => ({
      isSelecting: selecting,
      selectedIds: selecting ? state.selectedIds : new Set(),
    })),
  clear: () => set({ selectedIds: new Set(), isSelecting: false }),
}));