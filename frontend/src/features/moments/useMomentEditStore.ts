import { create } from "zustand";
import { Moment } from "@tng/shared";

interface MomentEditState {
  /** Draft moment (chưa đủ slot) đang được chỉnh sửa — mở CreateMomentDialog ở edit mode. */
  editDraft: Moment | null;
  setEditDraft: (moment: Moment | null) => void;
}

export const useMomentEditStore = create<MomentEditState>((set) => ({
  editDraft: null,
  setEditDraft: (moment) => set({ editDraft: moment }),
}));