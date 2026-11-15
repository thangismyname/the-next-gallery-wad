import { infiniteQueryOptions } from "@tanstack/react-query";
import { momentsFeedQueryKey } from "@tng/shared";

import { momentsApi } from "@/services";

/**
 * The Moments feed query (20 / page) — shared by the Moments tab and the Library
 * "Recent moments" strip, so both read one cache (web: `momentsQuery.ts`).
 */
export const momentsFeedOptions = infiniteQueryOptions({
  queryKey: momentsFeedQueryKey,
  initialPageParam: 0,
  queryFn: ({ pageParam }) => momentsApi.fetchMoments({ offset: pageParam, limit: 20 }),
  getNextPageParam: (last) => (last.hasMore ? last.offset + last.limit : undefined),
  staleTime: 15_000,
});
