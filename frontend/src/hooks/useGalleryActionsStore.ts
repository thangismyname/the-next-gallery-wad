// hooks/useGalleryActionsStore.ts
// State dùng chung cho các dialog hành động gallery (Share, Delete, Thêm vào album) —
// vì useGalleryActions() được gọi ở nhiều nơi (GalleryView, MainLayout),
// state phải nằm trong store để mọi instance tham chiếu cùng 1 nguồn.
import { create } from "zustand";

interface GalleryActionsState {
  shareDialogOpen: boolean;
  shareMediaIds: string[];
  deleteDialogOpen: boolean;
  pendingDeleteIds: string[];
  deleteBusy: boolean;
  /** Ảnh đang chờ chọn album ("Thêm vào album"); null = hộp thoại đóng. */
  addToAlbumIds: string[] | null;

  openShare: (ids: string[]) => void;
  setShareDialogOpen: (open: boolean) => void;

  openDelete: (ids: string[]) => void;
  closeDeleteDialog: () => void;
  setDeleteBusy: (busy: boolean) => void;
  setDeleteDialogOpen: (open: boolean) => void;

  openAddToAlbum: (ids: string[]) => void;
  closeAddToAlbum: () => void;
}

export const useGalleryActionsStore = create<GalleryActionsState>((set) => ({
  shareDialogOpen: false,
  shareMediaIds: [],
  deleteDialogOpen: false,
  pendingDeleteIds: [],
  deleteBusy: false,
  addToAlbumIds: null,

  openShare: (ids) => set({ shareMediaIds: ids, shareDialogOpen: true }),
  setShareDialogOpen: (open) => set({ shareDialogOpen: open }),

  openDelete: (ids) => set({ pendingDeleteIds: ids, deleteDialogOpen: true }),
  setDeleteDialogOpen: (open) =>
    set({ deleteDialogOpen: open, pendingDeleteIds: [] }),
  closeDeleteDialog: () =>
    set((s) =>
      s.deleteBusy ? s : { deleteDialogOpen: false, pendingDeleteIds: [] },
    ),
  setDeleteBusy: (busy) => set({ deleteBusy: busy }),

  openAddToAlbum: (ids) => set({ addToAlbumIds: ids }),
  closeAddToAlbum: () => set({ addToAlbumIds: null }),
}));
