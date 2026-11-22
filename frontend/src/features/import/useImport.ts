import { createImportStore, importsQueryKey } from "@tng/shared";

import { queryClient } from "@/lib/queryClient";
import { galleryQueryPrefix } from "@/hooks/useGalleryMedia";
import { createAlbum, fetchAlbums } from "@/services/albums";
import { importsApi } from "@/services/imports";
import { sendMedia } from "@/services/upload";

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
const refreshGallery = () => {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    void queryClient.invalidateQueries({ queryKey: galleryQueryPrefix });
    void queryClient.invalidateQueries({ queryKey: importsQueryKey });
  }, 2000);
};

/**
 * Nhập Google Takeout trên web — engine chung (`@tng/shared` `import/engine.ts`) + upload bằng
 * `sendMedia` (file lớn gửi chia nhỏ). Store toàn cục: chuyển trang trong app vẫn chạy tiếp (đóng tab thì dừng).
 */
export const useImport = createImportStore<File>({
  client: "web",
  imports: importsApi,
  listAlbums: async () => (await fetchAlbums()).owned.filter((a) => a.kind === "manual"),
  createAlbum: async (name) => (await createAlbum({ name })).id,
  upload: (parts, meta, signal) => sendMedia(parts, meta, { signal }),
  onUploaded: refreshGallery,
});
