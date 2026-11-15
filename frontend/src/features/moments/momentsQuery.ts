import { momentsFeedQueryKey } from "@tng/shared";
import { infiniteQueryOptions } from "@tanstack/react-query";
import { fetchMoments } from "@/services/moments";

/**
 * The Moments feed query — one definition shared by the Moments page and the
 * Gallery "Recent moments" strip (same cache → the strip is free once either
 * page loaded it, and reactions / new posts show up in both).
 */
export const momentsFeedOptions = infiniteQueryOptions({
  queryKey: momentsFeedQueryKey,
  initialPageParam: 0,
  queryFn: ({ pageParam }) => fetchMoments({ offset: pageParam }),
  getNextPageParam: (last) => (last.hasMore ? last.offset + last.limit : undefined),
  staleTime: 30_000,
});
