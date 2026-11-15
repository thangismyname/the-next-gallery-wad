import { momentInvitationsCountQueryKey, momentInvitationsQueryKey, type MomentInvitationPage } from "@tng/shared";
import { useEffect, useMemo } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMomentInvitationCount, fetchMomentInvitations } from "@/services/moments";
import { SIGNAL } from "@/services/signaling";
import { useSignaling } from "@/hooks/useSignaling";

/**
 * Lời mời moment collab (draft chưa đủ ảnh) — danh sách phân trang + số đếm cho
 * badge, tự làm mới khi WS báo `moment:collab-invite` / `moment:collab-complete`.
 */
export function useMomentInvitations(onFeedChanged: () => void) {
  const signaling = useSignaling();
  const queryClient = useQueryClient();

  const list = useInfiniteQuery<MomentInvitationPage>({
    queryKey: momentInvitationsQueryKey,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchMomentInvitations({ offset: pageParam as number }),
    getNextPageParam: (last) => (last.hasMore ? last.offset + last.limit : undefined),
    staleTime: 15_000,
  });

  // Badge dùng endpoint count (không phụ thuộc số trang đã tải).
  const { data: count } = useQuery({
    queryKey: momentInvitationsCountQueryKey,
    queryFn: fetchMomentInvitationCount,
    staleTime: 30_000,
  });

  const items = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);
  const { refetch } = list;

  useEffect(() => {
    const refreshCount = () =>
      void queryClient.invalidateQueries({ queryKey: momentInvitationsCountQueryKey });
    const offs = [
      signaling.on(SIGNAL.MOMENT_COLLAB_INVITE, (payload) => {
        if (!(payload as { momentId?: string }).momentId) return;
        // Refetch cả list + count → badge nhảy số ngay (count là nguồn duy nhất).
        void refetch();
        refreshCount();
      }),
      signaling.on(SIGNAL.MOMENT_COLLAB_COMPLETE, () => {
        onFeedChanged();
        void refetch();
        refreshCount();
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [signaling, refetch, onFeedChanged, queryClient]);

  /** Mở popover → tải lại danh sách. */
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: momentInvitationsQueryKey });

  return {
    items,
    // Tổng số lời mời: count từ server (đúng cả khi list mới tải trang đầu).
    total: count ?? items.length,
    isPending: list.isPending,
    refetch,
    invalidate,
    fetchNextPage: list.fetchNextPage,
    hasNextPage: list.hasNextPage,
    isFetchingNextPage: list.isFetchingNextPage,
  };
}
