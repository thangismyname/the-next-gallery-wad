import { useQuery } from "@tanstack/react-query";
import { trashQueryKey } from "@tng/shared";

import { useStorage } from "@/features/profile/useProfile";
import { mediaApi } from "@/services";

/**
 * Albums → Collections "Trash" card (web `useTrashSummary`): count + size from
 * `/profile/storage` (the trash API has no total) + cover = newest trashed item.
 * The cover key sits under `trashQueryKey`, so every trash refresh updates it.
 */
export function useTrashSummary() {
  const storage = useStorage();
  const cover = useQuery({
    queryKey: [...trashQueryKey, "cover"],
    queryFn: () => mediaApi.fetchTrash(0, 1),
    staleTime: 30_000,
  });
  const first = cover.data?.items[0];
  return {
    count: storage.data?.trashCount ?? (first ? 1 : 0),
    bytes: storage.data?.trashBytes ?? 0,
    cover: first?.thumbnailUrlLarge ?? first?.thumbnailUrl ?? null,
  };
}
