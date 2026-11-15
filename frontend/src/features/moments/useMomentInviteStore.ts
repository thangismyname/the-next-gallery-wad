import { create } from "zustand";

interface MomentInviteState {
  pendingFillId: string | null;
  setPendingFillId: (id: string | null) => void;
}

export const useMomentInviteStore = create<MomentInviteState>((set) => ({
  pendingFillId: null,
  setPendingFillId: (id) => set({ pendingFillId: id }),
}));