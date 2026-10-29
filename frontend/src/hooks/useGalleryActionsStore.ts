// hooks/useGalleryActionsStore.ts
// State dùng chung cho các dialog hành động gallery (Share, Delete, Thêm vào album) —
// vì useGalleryActions() được gọi ở nhiều nơi (GalleryView, MainLayout),
// state phải nằm trong store để mọi instance tham chiếu cùng 1 nguồn.
import { create } from "zustand";

interface GalleryActionsState {
  shareDialogOpen: boolean;
  shareMediaIds: string[];
  shareInitialFriendId: string | null;
  deleteDialogOpen: boolean;
  pendingDeleteIds: string[];
  deleteBusy: boolean;
  /** Ảnh đang chờ chọn album ("Thêm vào album"); null = hộp thoại đóng. */
  addToAlbumIds: string[] | null;

  openShare: (ids: string[], opts?: { friendId?: string | null }) => void;
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
  shareInitialFriendId: null,
  deleteDialogOpen: false,
  pendingDeleteIds: [],
  deleteBusy: false,
  addToAlbumIds: null,

  openShare: (ids, opts) =>
    set({
      shareMediaIds: ids,
      shareInitialFriendId: opts?.friendId ?? null,
      shareDialogOpen: true,
    }),
  setShareDialogOpen: (open) =>
    set((s) =>
      open ? s : { shareDialogOpen: open, shareInitialFriendId: null },
    ),

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
