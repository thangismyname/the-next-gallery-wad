import { useCallback, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  albumMediaQueryKey,
  albumQueryKey,
  albumsQueryKey,
  fetchAlbum,
  fetchAlbumMedia,
} from "@/services/albums";
import { toMedia } from "@/services/media";

const PAGE_SIZE = 60;

/**
 * Dữ liệu trang 1 album: thông tin album + ảnh (phân trang 60/lần, chỉ tải
 * khi đã là thành viên — lời mời chưa nhận thì không) + `run` chạy 1 thao tác
 * (gỡ ảnh, đặt bìa, xoá, rời…) rồi làm mới album / ảnh / danh sách album.
 */
export function useAlbumDetail(id: string) {
  const queryClient = useQueryClient();

  const albumQuery = useQuery({
    queryKey: albumQueryKey(id),
    queryFn: () => fetchAlbum(id),
    retry: false,
  });
  const album = albumQuery.data;

  const mediaQuery = useInfiniteQuery({
    queryKey: albumMediaQueryKey(id),
    queryFn: ({ pageParam }) => fetchAlbumMedia(id, { limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    enabled: Boolean(album && !album.pending),
  });
  // `raw` giữ ownerId / addedBy (quyền gỡ ảnh); `items` cho ImageCard / Lightbox.
  const raw = useMemo(() => mediaQuery.data?.pages.flatMap((p) => p.items) ?? [], [mediaQuery.data]);
  const items = useMemo(() => raw.map(toMedia), [raw]);

  const refresh = useCallback(
    () =>
      Promise.all(
        [albumQueryKey(id), albumMediaQueryKey(id), albumsQueryKey].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
    [id, queryClient],
  );

  const [busy, setBusy] = useState(false);
  /** Chạy 1 thao tác → làm mới → `after` (vd đóng dialog / điều hướng). */
  const run = useCallback(
    async (action: () => Promise<unknown>, after?: () => void) => {
      setBusy(true);
      try {
        await action();
        await refresh();
        after?.();
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  return { albumQuery, album, mediaQuery, raw, items, refresh, run, busy };
}
