// Nguồn ảnh của lưới chọn ảnh (moment…): cả thư viện · Yêu thích · 1 nhãn · 1 album (thường / tự
// động) — phân trang; + tìm kiếm (search kết hợp) trong đúng nguồn đó. Chỉ ảnh CỦA MÌNH (moment /
// album chỉ nhận ảnh của mình; album chia sẻ có thể chứa ảnh người khác).
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { MediaListItem, PickAlbum } from "@tng/shared";
import { useMemo } from "react";

import { useSession } from "@/features/auth/session";
import { useGalleryMedia } from "@/features/gallery/useGalleryMedia";
import { albumsApi, labelsApi, mediaApi } from "@/services";

export type PickSource =
  | { kind: "all" }
  | { kind: "favorites" }
  | { kind: "label"; id: string; name: string }
  | { kind: "album"; album: PickAlbum };

const PAGE = 100;

export const pickSourceKey = (s: PickSource) =>
  s.kind === "label" ? `label:${s.id}` : s.kind === "album" ? s.album.key : s.kind;

/** Phạm vi của search kết hợp (`scope=`) cho nguồn này; album tự động chưa có phạm vi → cả thư viện. */
const searchScope = (s: PickSource) =>
  s.kind === "favorites"
    ? "favorites"
    : s.kind === "label"
      ? `label:${s.id}`
      : s.kind === "album" && s.album.source === "album"
        ? `album:${s.album.id}`
        : null;

async function fetchPage(s: Exclude<PickSource, { kind: "all" }>, offset: number) {
  if (s.kind === "favorites") return labelsApi.fetchSaved("favorites", offset, PAGE);
  if (s.kind === "label") return labelsApi.fetchSaved(s.id, offset, PAGE);
  const opts = { limit: PAGE, offset };
  return s.album.source === "auto" ? albumsApi.fetchAutoAlbumMedia(s.album.id, opts) : albumsApi.fetchAlbumMedia(s.album.id, opts);
}

export function usePickSourceMedia(source: PickSource, query: string) {
  const me = useSession().data?.user.id;
  const q = query.trim();
  const library = useGalleryMedia("newest");
  const paged = useInfiniteQuery({
    queryKey: ["media-pick", pickSourceKey(source)],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => ({ ...(await fetchPage(source as Exclude<PickSource, { kind: "all" }>, pageParam)), offset: pageParam }),
    getNextPageParam: (last) => (last.offset + last.items.length < last.total ? last.offset + last.items.length : undefined),
    enabled: source.kind !== "all" && !q && Boolean(me),
  });
  const found = useQuery({
    queryKey: ["media-pick", "search", pickSourceKey(source), q],
    queryFn: ({ signal }) => mediaApi.searchGallerySemantic(q, signal, searchScope(source)),
    enabled: Boolean(q),
    staleTime: 60_000,
  });

  const pagedItems = useMemo(
    () =>
      (paged.data?.pages ?? [])
        .flatMap((p) => p.items as (MediaListItem & { ownerId?: string | null })[])
        .filter((i) => !i.ownerId || i.ownerId === me),
    [paged.data, me],
  );

  if (q) {
    return { items: found.data ?? [], isPending: found.isPending, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: () => {} };
  }
  if (source.kind === "all") return library;
  return {
    items: pagedItems,
    isPending: paged.isPending,
    hasNextPage: paged.hasNextPage,
    isFetchingNextPage: paged.isFetchingNextPage,
    fetchNextPage: () => void paged.fetchNextPage(),
  };
}
