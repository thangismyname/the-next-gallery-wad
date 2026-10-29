import { create } from "zustand";

// Dialog "Quản lý nhãn" render 1 lần ở MainLayout — mở được từ trang Yêu
// thích, menu gắn nhãn (thanh chọn ảnh) và Lightbox.
interface LabelManagerState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useLabelManager = create<LabelManagerState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
