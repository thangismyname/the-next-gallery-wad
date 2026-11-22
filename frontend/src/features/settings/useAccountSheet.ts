// Bảng tài khoản (AccountSheet) mở từ avatar ở mọi khu (app · Admin · Developer) và từ link /settings.
import { create } from "zustand";

export const useAccountSheet = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
