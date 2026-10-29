// Cập nhật cache react-query của Moments ngay tại chỗ (không cần refetch).
import type { QueryClient } from "@tanstack/react-query";
import { momentsFeedQueryKey } from "@/services/moments";
import type { Moment } from "@/types";

/**
 * Tăng / giảm memeCount của 1 moment trong cache feed → nút lật (mặt sau)
 * cập nhật ngay. Sai lệch (nếu có) được lần fetch sau sửa lại.
 */
export function bumpFeedMemeCount(queryClient: QueryClient, momentId: string, delta: number) {
  queryClient.setQueriesData(
    { queryKey: momentsFeedQueryKey },
    (old: { items: Moment[] } | undefined) => {
      if (!old) return old;
      return {
        ...old,
        items: old.items.map((m) =>
          m.id === momentId ? { ...m, memeCount: Math.max(0, (m.memeCount ?? 0) + delta) } : m,
        ),
      };
    },
  );
}
