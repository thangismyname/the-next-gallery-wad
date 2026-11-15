import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { tagMediaQueryKey, tagSummaryQueryKey } from "@tng/shared";
import { useMemo } from "react";

import { mediaApi } from "@/services";

const PAGE_SIZE = 60;

/**
 * Per-tag photo count (≥ its threshold) + cover + auto threshold, for the 17
 * categories and the "oi.*" labels. Same cache keys as the web — the whole
 * `["ai", "tags"]` prefix is invalidated after a classification batch / trash.
 */
export function useTagSummary() {
  const query = useQuery({
    queryKey: tagSummaryQueryKey,
    queryFn: mediaApi.fetchTagSummary,
    staleTime: 30_000,
  });
  const byTag = useMemo(() => new Map((query.data ?? []).map((s) => [s.tag, s])), [query.data]);
  return { ...query, byTag };
}

/**
 * Photos of one tag, most confident first (`score` = confidence), paged 60 at a
 * time. `minConfidence` null = the tag's own threshold (picked on val at train time).
 */
export function useTagMedia(tag: string, minConfidence: number | null) {
  const query = useInfiniteQuery({
    queryKey: tagMediaQueryKey(tag, minConfidence),
    queryFn: ({ pageParam }) => mediaApi.fetchTagMedia(tag, { minConfidence, limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    // Moving the threshold keeps the old grid until the new one arrives (no flash).
    placeholderData: (previous) => previous,
  });
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  return { ...query, items, total: query.data?.pages[0]?.total ?? 0 };
}
