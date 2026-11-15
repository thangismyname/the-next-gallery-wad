import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  albumMediaQueryKey,
  albumQueryKey,
  albumsQueryKey,
  autoAlbumMediaQueryKey,
  autoAlbumsQueryKey,
} from "@tng/shared";
import { useCallback, useMemo } from "react";

import { albumsApi } from "@/services";

const PAGE_SIZE = 60;

const nextOffset = <P extends { total: number; items: unknown[] }>(last: P, pages: P[]) => {
  const loaded = pages.reduce((n, p) => n + p.items.length, 0);
  return loaded < last.total ? loaded : undefined;
};

/** `{ owned, shared, invitations }` — same cache as the web (`albumsQueryKey`). */
export function useAlbumLists() {
  return useQuery({ queryKey: albumsQueryKey, queryFn: albumsApi.fetchAlbums, staleTime: 30_000 });
}

/** Auto albums (type · content · time · objects), recomputed by the API — loaded apart so they never block. */
export function useAutoAlbums() {
  return useQuery({ queryKey: autoAlbumsQueryKey, queryFn: albumsApi.fetchAutoAlbums, staleTime: 60_000 });
}

/**
 * One album + its photos (60/page; not loaded for a pending invitation) +
 * `refresh` (album, its photos, the lists) after an action.
 */
export function useAlbumDetail(id: string) {
  const queryClient = useQueryClient();
  const albumQuery = useQuery({ queryKey: albumQueryKey(id), queryFn: () => albumsApi.fetchAlbum(id), retry: false });
  const album = albumQuery.data;
  const media = useInfiniteQuery({
    queryKey: albumMediaQueryKey(id),
    queryFn: ({ pageParam }) => albumsApi.fetchAlbumMedia(id, { limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    enabled: Boolean(album && !album.pending),
  });
  const items = useMemo(() => media.data?.pages.flatMap((p) => p.items) ?? [], [media.data]);
  const refresh = useCallback(
    () =>
      Promise.all(
        [albumQueryKey(id), albumMediaQueryKey(id), albumsQueryKey].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
    [id, queryClient],
  );
  return { albumQuery, album, media, items, refresh };
}

/** Photos of one auto album (read-only). */
export function useAutoAlbumMedia(key: string) {
  const media = useInfiniteQuery({
    queryKey: autoAlbumMediaQueryKey(key),
    queryFn: ({ pageParam }) => albumsApi.fetchAutoAlbumMedia(key, { limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    retry: false,
  });
  const items = useMemo(() => media.data?.pages.flatMap((p) => p.items) ?? [], [media.data]);
  return { ...media, items, total: media.data?.pages[0]?.total ?? 0 };
}
