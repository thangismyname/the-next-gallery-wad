import { GallerySort, MediaPage } from "@tng/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchMedia } from "@/services/media";

export const PAGE_SIZE = 36;

// Prefix chung để invalidate/update cache trên MỌI kiểu sort.
export const galleryQueryPrefix = ["gallery", "media", "infinite"] as const;

export const galleryQueryKey = (
  limit = PAGE_SIZE,
  sort: GallerySort = "newest",
) => [...galleryQueryPrefix, limit, sort] as const;

export function useGalleryMedia(sort: GallerySort = "newest") {
  return useInfiniteQuery<MediaPage>({
    queryKey: galleryQueryKey(PAGE_SIZE, sort),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchMedia(pageParam as number, PAGE_SIZE, sort),
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined;
      return allPages.length * PAGE_SIZE;
    },
    staleTime: 120_000,
    gcTime: 5 * 60_000,
  });
}
