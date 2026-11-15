import { useQuery, useQueryClient } from "@tanstack/react-query";
import { albumsQueryKey, type Album } from "@tng/shared";
import { useCallback, useMemo } from "react";

import { albumsApi } from "@/services";

/**
 * Albums the user can add photos to: own + shared as editor, manual only (smart
 * albums are rule-based), no pending invitations.
 */
export function useAddToAlbum(enabled = true) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: albumsQueryKey, queryFn: albumsApi.fetchAlbums, staleTime: 30_000, enabled });

  const albums = useMemo<Album[]>(
    () =>
      [...(query.data?.owned ?? []), ...(query.data?.shared ?? [])].filter(
        (a) => a.kind === "manual" && !a.pending && a.role !== "viewer",
      ),
    [query.data],
  );

  const add = useCallback(
    async (albumId: string, mediaIds: string[]) => {
      const result = await albumsApi.addAlbumMedia(albumId, mediaIds);
      void queryClient.invalidateQueries({ queryKey: albumsQueryKey });
      return result;
    },
    [queryClient],
  );

  return { albums, isPending: query.isPending, add };
}
