import { useInfiniteQuery } from "@tanstack/react-query";
import type { GallerySort, MediaListItem } from "@tng/shared";
import { useMemo } from "react";

import { mediaApi } from "@/services";

const PAGE_SIZE = 60;

export const galleryKeys = {
  all: ["gallery"] as const,
  list: (sort: GallerySort) => [...galleryKeys.all, "list", sort] as const,
};

/** Library media in `sort` order, paged (infinite scroll). */
export function useGalleryMedia(sort: GallerySort) {
  const query = useInfiniteQuery({
    queryKey: galleryKeys.list(sort),
    queryFn: ({ pageParam }) => mediaApi.fetchMedia(pageParam, PAGE_SIZE, sort),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.hasMore ? last.offset + last.items.length : undefined),
  });

  // Flatten pages; drop duplicates (offset paging can repeat an item when new
  // uploads shift the list between two page loads).
  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: MediaListItem[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const item of page.items) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          out.push(item);
        }
      }
    }
    return out;
  }, [query.data]);

  return { ...query, items, total: query.data?.pages[0]?.total };
}
