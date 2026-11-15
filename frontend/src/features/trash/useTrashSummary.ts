import { trashQueryKey, storageQueryKey } from "@tng/shared";
import { useQuery } from "@tanstack/react-query";
import { fetchTrash } from "@/services/media";
import { fetchStorageBreakdown } from "@/services/profile";

/**
 * Thẻ "Thùng rác" trong Albums: số mục + dung lượng (`/profile/storage`, API thùng rác
 * không trả tổng) + bìa = mục xoá gần nhất. Key bìa nằm dưới `trashQueryKey` nên mọi
 * chỗ làm mới thùng rác cũng làm mới thẻ.
 */
export function useTrashSummary() {
  const storage = useQuery({ queryKey: storageQueryKey, queryFn: fetchStorageBreakdown, staleTime: 30_000 });
  const cover = useQuery({
    queryKey: [...trashQueryKey, "cover"],
    queryFn: () => fetchTrash(0, 1),
    staleTime: 30_000,
  });
  const first = cover.data?.items[0];
  return {
    count: storage.data?.trashCount ?? (first ? 1 : 0),
    bytes: storage.data?.trashBytes ?? 0,
    coverUrl: first?.thumbnailUrlLarge ?? first?.thumbnailUrl ?? null,
  };
}
