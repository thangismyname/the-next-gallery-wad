// Dữ liệu cho picker theo lens + chữ đang gõ:
//   bộ lọc, không gõ     → danh sách phân trang vô hạn (cache dùng chung)
//   tag AI, không gõ     → ảnh của tag theo độ tin cậy, phân trang
//   album, không gõ      → ảnh CỦA MÌNH trong album, phân trang (ảnh người khác bỏ qua —
//                          moment / album chỉ nhận ảnh của mình)
//   có gõ / phạm vi       → search kết hợp (CLIP + tag + vật thể) trong phạm vi
// Key danh sách nằm dưới prefix gallery → upload / xoá / yêu thích ở đâu cũng
// cập nhật picker (useGalleryActions, useCamera, TrashView…).
import { type MediaFilter, type MediaListItem } from "@tng/shared";
import { useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { galleryQueryPrefix } from "@/hooks/useGalleryMedia";
import { fetchMediaByFilter, fetchTagMedia, searchGallerySemantic } from "@/services/media";
import { fetchAlbumMedia, fetchAutoAlbumMedia } from "@/services/albums";
import { useSession } from "@/services/authClient";
import type { Lens } from "./lens";

/** API list / tag cho tối đa 100 mỗi trang (media.schema.js). */
export const PICKER_PAGE_SIZE = 100;

export const mediaPickerQueryKey = (filter: MediaFilter) =>
  [...galleryQueryPrefix, "picker", filter] as const;

interface Page {
  items: MediaListItem[];
  hasMore: boolean;
  /** Số item server trả trước khi lọc (album: bỏ ảnh người khác) — để tính offset trang sau. */
  fetched?: number;
}

function dedupe(pages: Page[] | undefined) {
  const seen = new Set<string>();
  const out: MediaListItem[] = [];
  for (const page of pages ?? []) {
    for (const item of page.items) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        out.push(item);
      }
    }
  }
  return out;
}

/** Search kết hợp hiểu tên tag ở mọi ngôn ngữ → "tag + chữ gõ" = 1 câu tìm. */
function searchSpec(lens: Lens, text: string): { q: string; scope: string | null } | null {
  const q = text.trim();
  if (lens.kind === "scope" && lens.scope.kind === "album" && !q) return null; // → albumMode
  if (lens.kind === "scope") return { q, scope: lens.scope.key };
  if (lens.kind === "album") {
    if (!q) return null; // → albumMode
    // shortcut: album tự động chưa là phạm vi search → gõ chữ = tìm cả thư viện; thêm scope "auto:<key>" ở backend nếu cần.
    return { q, scope: lens.album.source === "album" ? `album:${lens.album.id}` : null };
  }
  if (lens.kind === "tag") return q ? { q: `${lens.name} ${q}`, scope: null } : null;
  if (lens.kind === "filter" && q) return { q, scope: lens.filter === "favorites" ? "favorites" : null };
  return null;
}

export function useMediaPickerQuery(lens: Lens, text: string) {
  const search = searchSpec(lens, text);
  const filter = lens.kind === "filter" ? lens.filter : "all";
  const tag = lens.kind === "tag" ? lens.tag : null;
  // Album đang mở (không gõ chữ): album thường (menu / gợi ý gõ tên) hoặc album tự động.
  const album: { source: "album" | "auto"; id: string } | null = search
    ? null
    : lens.kind === "album"
      ? lens.album
      : lens.kind === "scope" && lens.scope.kind === "album"
        ? { source: "album", id: lens.scope.key.slice("album:".length) }
        : null;
  const albumId = album ? `${album.source}:${album.id}` : null;
  const listMode = !search && lens.kind === "filter";
  const tagMode = !search && tag !== null;
  const me = useSession().data?.user.id;

  const list = useInfiniteQuery<Page>({
    queryKey: mediaPickerQueryKey(filter),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchMediaByFilter(filter, pageParam as number, PICKER_PAGE_SIZE),
    getNextPageParam: (last, all) =>
      last.hasMore ? all.reduce((sum, p) => sum + p.items.length, 0) : undefined,
    enabled: listMode,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });

  const tagged = useInfiniteQuery<Page & { total: number }>({
    queryKey: ["ai", "tags", "media", tag, "picker"],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const page = await fetchTagMedia(tag!, { minConfidence: null, limit: PICKER_PAGE_SIZE, offset: pageParam as number });
      return { ...page, hasMore: (pageParam as number) + page.items.length < page.total };
    },
    getNextPageParam: (last, all) =>
      last.hasMore ? all.reduce((sum, p) => sum + p.items.length, 0) : undefined,
    enabled: tagMode,
    staleTime: 60_000,
  });

  const inAlbum = useInfiniteQuery<Page>({
    queryKey: [...galleryQueryPrefix, "picker", "album", albumId],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const opts = { limit: PICKER_PAGE_SIZE, offset: pageParam as number };
      // Album tự động chỉ gồm ảnh của mình; album thường (được chia sẻ) có thể có ảnh người khác.
      const page = album!.source === "auto" ? await fetchAutoAlbumMedia(album!.id, opts) : await fetchAlbumMedia(album!.id, opts);
      // Offset đếm cả ảnh người khác (trước khi lọc) → trang sau tính theo số server trả.
      return {
        items: page.items.filter((i) => !("ownerId" in i) || !i.ownerId || i.ownerId === me),
        hasMore: (pageParam as number) + page.items.length < page.total,
        fetched: page.items.length,
      };
    },
    getNextPageParam: (last, all) =>
      last.hasMore ? all.reduce((sum, p) => sum + (p.fetched ?? p.items.length), 0) : undefined,
    enabled: albumId !== null && Boolean(me),
    staleTime: 60_000,
  });

  const found = useQuery({
    queryKey: ["media-picker", "search", search?.q ?? "", search?.scope ?? ""],
    queryFn: ({ signal }) => searchGallerySemantic(search!.q, signal, search!.scope),
    enabled: Boolean(search),
    staleTime: 60_000,
  });

  const listItems = useMemo(() => dedupe(list.data?.pages), [list.data]);
  const tagItems = useMemo(() => dedupe(tagged.data?.pages), [tagged.data]);
  const albumItems = useMemo(() => dedupe(inAlbum.data?.pages), [inAlbum.data]);
  const foundItems = useMemo(() => {
    const items = found.data ?? [];
    // Tìm trong "Ảnh" / "Video" → lọc theo loại ngay tại máy.
    if (lens.kind === "filter" && (lens.filter === "photos" || lens.filter === "videos")) {
      const type = lens.filter === "photos" ? "photo" : "video";
      return items.filter((i) => i.mediaType === type);
    }
    return items;
  }, [found.data, lens]);

  const paged = albumId !== null ? inAlbum : tagMode ? tagged : list;
  const active = search ? found : paged;
  return {
    items: search ? foundItems : albumId !== null ? albumItems : tagMode ? tagItems : listItems,
    loading: active.isPending,
    error: active.isError,
    retry: () => void active.refetch(),
    hasMore: !search && Boolean(paged.hasNextPage),
    loadingMore: !search && paged.isFetchingNextPage,
    loadMore: () => {
      if (!search && paged.hasNextPage && !paged.isFetchingNextPage) void paged.fetchNextPage();
    },
    /** Kết quả search có giới hạn (≤ 20 / ≤ 60 trong phạm vi), không phân trang. */
    isSearch: Boolean(search),
  };
}
