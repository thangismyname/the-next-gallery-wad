import { useQuery } from "@tanstack/react-query";
import { savedQueryKey, type SavedFilter } from "@tng/shared";

import { labelsApi } from "@/services";

/**
 * Photos in Favorites: hearted OR labeled (`all`), hearted only (`favorites`),
 * or one label (`<labelId>`). Same cache keys as the web (`["favorites", filter]`)
 * — invalidate the `["favorites"]` prefix after heart / label / trash changes.
 */
export function useSaved(filter: SavedFilter, opts?: { limit?: number; enabled?: boolean }) {
  const limit = opts?.limit ?? 1000;
  return useQuery({
    queryKey: limit === 1000 ? savedQueryKey(filter) : [...savedQueryKey(filter), limit],
    queryFn: () => labelsApi.fetchSaved(filter, 0, limit),
    staleTime: 30_000,
    enabled: opts?.enabled ?? true,
  });
}
