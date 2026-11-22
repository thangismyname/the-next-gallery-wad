import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { labelsQueryKey, storageQueryKey, trashQueryKey, type MediaListItem, type MediaPage, type SavedMediaItem, type TagMediaPage } from "@tng/shared";
import { Directory, File, Paths } from "expo-file-system";
import { Asset, requestPermissionsAsync } from "expo-media-library";
import * as Sharing from "expo-sharing";
import { useCallback } from "react";

import { mediaApi } from "@/services";

import { searchKeys, type SearchResults } from "../search/useSearch";

import { galleryKeys } from "./useGalleryMedia";

/** Thrown when the user refuses Photos access (show the "enable in Settings" hint). */
export class PhotosPermissionError extends Error {}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

/** File name for the downloaded original: the upload's name if it has an extension, else `<id>.<ext>`. */
function fileName(item: MediaListItem): string {
  const title = (item.title ?? "").replace(/[/\\?%*:|"<>]/g, "_").trim();
  if (/\.[a-z0-9]{2,5}$/i.test(title)) return title;
  const ext = EXT_BY_MIME[item.mimeType ?? ""] ?? (item.mediaType === "video" ? "mp4" : "jpg");
  return `${title || item.id}.${ext}`;
}

/** Downloads the original (signed URL from the API, no cookie needed) into the app cache. */
async function downloadOriginal(item: MediaListItem): Promise<File> {
  const dir = new Directory(Paths.cache, "tng-originals");
  dir.create({ idempotent: true, intermediates: true });
  return File.downloadFileAsync(item.url, new File(dir, fileName(item)), { idempotent: true });
}

/**
 * Actions on media items (Lightbox: one, selection bar: many). Favorite / trash update every cached
 * gallery list optimistically (the grid and the Lightbox re-render at once) and
 * roll back by refetching on error. Share = system share sheet with the original
 * file; save = Photos library (asks for add-only access).
 */
export function useMediaActions() {
  const queryClient = useQueryClient();

  const patchLists = useCallback(
    (update: (items: MediaListItem[]) => MediaListItem[], totalDelta = 0) => {
      queryClient.setQueriesData<InfiniteData<MediaPage>>({ queryKey: galleryKeys.all }, (data) =>
        data?.pages
          ? {
              ...data,
              pages: data.pages.map((page, i) => ({
                ...page,
                items: update(page.items),
                total: i === 0 && page.total != null ? Math.max(page.total + totalDelta, 0) : page.total,
              })),
            }
          : data,
      );
      // Favorites lists (`["favorites", filter]`) show the same items.
      queryClient.setQueriesData<{ total: number; items: SavedMediaItem[] }>({ queryKey: ["favorites"] }, (data) =>
        data ? { ...data, items: update(data.items) as SavedMediaItem[] } : data,
      );
      // Search results show the same items (heart / trash must update there too).
      queryClient.setQueriesData<SearchResults>({ queryKey: searchKeys.all }, (data) =>
        data ? { ...data, media: update(data.media), objects: update(data.objects) } : data,
      );
      // AI Studio tag grids (`["ai", "tags", "media", tag, threshold]`, paged).
      queryClient.setQueriesData<InfiniteData<TagMediaPage>>({ queryKey: ["ai", "tags", "media"] }, (data) =>
        data?.pages
          ? {
              ...data,
              pages: data.pages.map((page, i) => ({
                ...page,
                items: update(page.items),
                total: i === 0 ? Math.max(page.total + totalDelta, 0) : page.total,
              })),
            }
          : data,
      );
    },
    [queryClient],
  );

  const refetchLists = useCallback(
    () => queryClient.invalidateQueries({ queryKey: galleryKeys.all }),
    [queryClient],
  );
  /** Favorites membership + label counts change with hearts / trash → refetch them (in the background). */
  const refreshSaved = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["favorites"] });
    void queryClient.invalidateQueries({ queryKey: labelsQueryKey });
  }, [queryClient]);

  /** Heart / un-heart several items at once (optimistic). */
  const setFavoriteMany = useCallback(
    async (ids: string[], favorite: boolean) => {
      const set = new Set(ids);
      patchLists((items) => items.map((m) => (set.has(m.id) ? { ...m, isFavorite: favorite } : m)));
      try {
        await mediaApi.setFavorite(ids, favorite);
        refreshSaved();
      } catch (error) {
        void refetchLists();
        throw error;
      }
    },
    [patchLists, refetchLists, refreshSaved],
  );
  const setFavorite = useCallback(
    (item: MediaListItem, favorite: boolean) => setFavoriteMany([item.id], favorite),
    [setFavoriteMany],
  );

  const moveManyToTrash = useCallback(
    async (ids: string[]) => {
      try {
        await mediaApi.moveToTrash(ids);
      } catch (error) {
        // Sent in chunks of 100 — the first chunks may already be in the Trash.
        void refetchLists();
        void queryClient.invalidateQueries({ queryKey: trashQueryKey });
        throw error;
      }
      const set = new Set(ids);
      patchLists((items) => items.filter((m) => !set.has(m.id)), -ids.length);
      refreshSaved();
      // Trash screen + its Albums card (cover, count / size from storage).
      void queryClient.invalidateQueries({ queryKey: trashQueryKey });
      void queryClient.invalidateQueries({ queryKey: storageQueryKey });
    },
    [patchLists, refreshSaved, refetchLists, queryClient],
  );
  const moveToTrash = useCallback((item: MediaListItem) => moveManyToTrash([item.id]), [moveManyToTrash]);

  const share = useCallback(async (item: MediaListItem) => {
    const file = await downloadOriginal(item);
    await Sharing.shareAsync(file.uri, { mimeType: item.mimeType ?? undefined });
  }, []);

  /**
   * Save originals to the Photos library one by one (`onProgress(done)` after
   * each). Asks for add-only access once.
   */
  const saveManyToPhotos = useCallback(async (items: MediaListItem[], onProgress?: (done: number) => void) => {
    const permission = await requestPermissionsAsync(true);
    if (!permission.granted) throw new PhotosPermissionError();
    let done = 0;
    for (const item of items) {
      const file = await downloadOriginal(item);
      await Asset.create(file.uri);
      onProgress?.(++done);
    }
  }, []);
  const saveToPhotos = useCallback((item: MediaListItem) => saveManyToPhotos([item]), [saveManyToPhotos]);

  return { setFavorite, setFavoriteMany, moveToTrash, moveManyToTrash, share, saveToPhotos, saveManyToPhotos };
}
