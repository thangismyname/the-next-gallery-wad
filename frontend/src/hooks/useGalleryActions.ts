// hooks/useGalleryActions.ts
import { useCallback } from "react";
import { InfiniteData, useQueryClient } from "@tanstack/react-query";
import { downloadMedia, moveToTrash, setFavorite } from "@/services/media";
import { useSelectionStore } from "./useSelectionStore";
import {
  galleryQueryKey,
  galleryQueryPrefix,
} from "./useGalleryMedia";
import { useGalleryActionsStore } from "./useGalleryActionsStore";
import type { MediaListItem, MediaPage } from "@/services/media";

// Cập nhật cache của MỌI kiểu sort trong gallery (newest, oldest, name_asc...).
function updateAllGalleryVariants(
  queryClient: ReturnType<typeof useQueryClient>,
  updater: (
    old: InfiniteData<MediaPage> | undefined,
  ) => InfiniteData<MediaPage> | undefined,
) {
  const cache = queryClient.getQueryCache();
  const queries = cache.findAll({ queryKey: galleryQueryPrefix });
  queries.forEach((query) => {
    queryClient.setQueryData<InfiniteData<MediaPage>>(query.queryKey, updater);
  });
}

export function useGalleryActions() {
  const clear = useSelectionStore((s) => s.clear);
  const queryClient = useQueryClient();

  // State các dialog nằm trong store dùng chung để GalleryView và MainLayout
  // (nơi thực sự render dialog) tham chiếu cùng 1 nguồn.
  const shareDialogOpen = useGalleryActionsStore((s) => s.shareDialogOpen);
  const shareMediaIds = useGalleryActionsStore((s) => s.shareMediaIds);
  const openShare = useGalleryActionsStore((s) => s.openShare);
  const setShareDialogOpen = useGalleryActionsStore((s) => s.setShareDialogOpen);

  const deleteDialogOpen = useGalleryActionsStore((s) => s.deleteDialogOpen);
  const pendingDeleteIds = useGalleryActionsStore((s) => s.pendingDeleteIds);
  const deleteBusy = useGalleryActionsStore((s) => s.deleteBusy);
  const openDelete = useGalleryActionsStore((s) => s.openDelete);
  const setDeleteBusy = useGalleryActionsStore((s) => s.setDeleteBusy);
  const setDeleteDialogOpen = useGalleryActionsStore(
    (s) => s.setDeleteDialogOpen,
  );
  const closeDeleteDialog = useGalleryActionsStore((s) => s.closeDeleteDialog);

  const handleShare = useCallback(
    (ids: string[]) => {
      if (!ids || ids.length === 0) return;
      openShare(ids);
    },
    [openShare],
  );

  // Tải bản gốc: 1 ảnh = file gốc, nhiều ảnh = .zip (services/media.ts).
  const handleDownload = useCallback((ids: string[]) => downloadMedia(ids), []);

  const handleDelete = useCallback(
    (ids: string[]) => {
      if (!ids || ids.length === 0) return;
      openDelete(ids);
    },
    [openDelete],
  );

  // Yêu thích: đọc trạng thái hiện tại từ cache gallery để quyết định thêm/bỏ.
  // Nếu tất cả ảnh đã được yêu thích → bỏ yêu thích; ngược lại → yêu thích.
  // Truyền `ensure` để ép 1 hướng (vd trang Favorites luôn bỏ yêu thích).
  const handleFavorite = useCallback(
    async (ids: string[], ensure?: boolean) => {
      if (!ids || ids.length === 0) return;

      let makeFavorite = ensure;
      if (makeFavorite === undefined) {
        const cached = queryClient.getQueryData<{
          pages: { items: MediaListItem[] }[];
        }>(galleryQueryKey());
        // Trang Yêu thích có cache riêng (["favorites", filter]) — gộp vào.
        const saved = queryClient
          .getQueriesData<{ items: MediaListItem[] }>({ queryKey: ["favorites"] })
          .flatMap(([, data]) => data?.items ?? []);
        const items = [...(cached?.pages.flatMap((p) => p.items) ?? []), ...saved];
        const selectedItems = items.filter((m) => ids.includes(m.id));
        makeFavorite =
          selectedItems.length === 0 || !selectedItems.every((m) => m.isFavorite);
      }

      try {
        await setFavorite(ids, makeFavorite);

        const idSet = new Set(ids);
        updateAllGalleryVariants(queryClient, (old) => {
          if (!old) return old;
          const pages = old.pages.map((page) => ({
            ...page,
            items: page.items.map((m) =>
              idSet.has(m.id) ? { ...m, isFavorite: makeFavorite } : m,
            ),
          }));
          return { ...old, pages };
        });

        // Home card "Favorites" + trang Yêu thích phụ thuộc — làm mới.
        await queryClient.invalidateQueries({
          queryKey: ["home", "favorites"],
        });
        await queryClient.invalidateQueries({ queryKey: ["favorites"] });
      } catch (error) {
        console.error("Cập nhật yêu thích thất bại:", error);
      }
    },
    [queryClient],
  );

  const confirmDelete = useCallback(async () => {
    if (pendingDeleteIds.length === 0) return;
    setDeleteBusy(true);
    try {
      await moveToTrash(pendingDeleteIds);
      clear();
      setDeleteDialogOpen(false);

      // Loại các ảnh vừa xóa ra khỏi cache ngay — grid cập nhật tức thì,
      // không chờ refetch từ server.
      const deleteSet = new Set(pendingDeleteIds);
      updateAllGalleryVariants(queryClient, (old) => {
        if (!old) return old;
        const pages = old.pages.map((page) => ({
          ...page,
          items: page.items.filter((m) => !deleteSet.has(m.id)),
          // Tổng số (header Thư viện) giảm ngay, không đợi refetch.
          total:
            page.total === undefined
              ? undefined
              : Math.max(0, page.total - deleteSet.size),
        }));
        return { ...old, pages };
      });

      await queryClient.invalidateQueries({ queryKey: galleryQueryPrefix });
      await queryClient.invalidateQueries({ queryKey: ["favorites"] });
      // Số ảnh / ảnh bìa của nhãn không tính ảnh trong thùng rác.
      await queryClient.invalidateQueries({ queryKey: ["labels"] });
      // Album (cả album tự động) đếm / hiện ảnh vừa xoá → làm mới.
      await queryClient.invalidateQueries({ queryKey: ["albums"] });
    } catch (err) {
      console.error("Xóa thất bại:", err);
    } finally {
      setDeleteBusy(false);
    }
  }, [pendingDeleteIds, clear, queryClient, setDeleteBusy, setDeleteDialogOpen]);

  return {
    handleShare,
    handleDownload,
    handleDelete,
    handleFavorite,
    confirmDelete,
    closeDeleteDialog,
    deleteDialogOpen,
    deleteBusy,
    pendingDeleteIds,
    shareDialogOpen,
    setShareDialogOpen,
    shareMediaIds,
  };
}