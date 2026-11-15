// Cập nhật cache react-query của Moments ngay tại chỗ (không cần refetch).
//
// Feed là useInfiniteQuery → cache có dạng { pages: [{ items, ... }], pageParams }
// nên mọi cập nhật phải đi qua `pages[].items`, KHÔNG phải `items` ở gốc.
import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { type Moment, type MomentFeedResponse, momentsFeedQueryKey } from "@tng/shared";

/** Sửa 1 moment trong cache feed (mọi trang) — trả về moment mới. */
export function patchFeedMoment(
  queryClient: QueryClient,
  momentId: string,
  updater: (moment: Moment) => Moment,
) {
  queryClient.setQueriesData<InfiniteData<MomentFeedResponse>>(
    { queryKey: momentsFeedQueryKey },
    (old) => {
      if (!old?.pages) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          items: page.items.map((m) => (m.id === momentId ? updater(m) : m)),
        })),
      };
    },
  );
}

/**
 * Tăng / giảm memeCount của 1 moment trong cache feed → nút lật (mặt sau)
 * cập nhật ngay. Sai lệch (nếu có) được lần fetch sau sửa lại.
 */
export function bumpFeedMemeCount(queryClient: QueryClient, momentId: string, delta: number) {
  patchFeedMoment(queryClient, momentId, (m) => ({
    ...m,
    memeCount: Math.max(0, (m.memeCount ?? 0) + delta),
  }));
}

/** Xoá 1 moment khỏi cache feed (người khác vừa xoá qua WS `moment:deleted`). */
export function removeFeedMoment(queryClient: QueryClient, momentId: string) {
  queryClient.setQueriesData<InfiniteData<MomentFeedResponse>>(
    { queryKey: momentsFeedQueryKey },
    (old) => {
      if (!old?.pages) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          items: page.items.filter((m) => m.id !== momentId),
        })),
      };
    },
  );
}

export type RemoteReactionPayload = {
  momentId: string;
  userId: string;
  userName?: string | null;
  userAvatarUrl?: string | null;
  /** null = người này vừa bỏ reaction. */
  emoji: string | null;
};

/** Áp 1 reaction của người khác vào 1 moment — null nếu thiếu dữ liệu để tính lại. */
function withRemoteReaction(m: Moment, p: RemoteReactionPayload): Moment | null {
  const previous = m.recentReactions.find((r) => r.userId === p.userId) ?? null;
  const reactions = m.reactions.map((r) => ({ ...r }));

  const decrement = (emoji: string) => {
    const index = reactions.findIndex((r) => r.emoji === emoji);
    if (index < 0) return false;
    if (reactions[index].count <= 1) reactions.splice(index, 1);
    else reactions[index].count -= 1;
    return true;
  };

  if (p.emoji === null) {
    // Không biết trước đó họ thả emoji nào → không trừ đúng count được.
    if (!previous?.emoji) return null;
    decrement(previous.emoji);
  } else {
    // Đổi emoji: phải trừ emoji cũ trước khi cộng emoji mới.
    if (previous) {
      if (!previous.emoji) return null;
      if (previous.emoji !== p.emoji) decrement(previous.emoji);
    }
    const index = reactions.findIndex((r) => r.emoji === p.emoji);
    if (index >= 0) reactions[index].count += 1;
    else reactions.push({ emoji: p.emoji, count: 1 });
  }

  reactions.sort((a, b) => b.count - a.count);

  const recentReactions = (
    p.emoji === null
      ? m.recentReactions.filter((r) => r.userId !== p.userId)
      : [
          {
            emoji: p.emoji,
            userId: p.userId,
            userName: p.userName ?? "Unknown",
            userAvatarUrl: p.userAvatarUrl ?? null,
          },
          ...m.recentReactions.filter((r) => r.userId !== p.userId),
        ]
  ).slice(0, 4);

  return { ...m, reactions, recentReactions };
}

/**
 * Reaction của người khác (WS `moment:reaction`) → cập nhật bubble ngay.
 * Trả `false` khi không áp được (moment chưa có trong cache / thiếu emoji cũ)
 * → caller nên invalidate để đồng bộ lại.
 */
export function applyRemoteReaction(
  queryClient: QueryClient,
  payload: RemoteReactionPayload,
): boolean {
  const cached = queryClient.getQueriesData<InfiniteData<MomentFeedResponse>>({
    queryKey: momentsFeedQueryKey,
  });
  const moment = cached
    .flatMap(([, data]) => data?.pages ?? [])
    .flatMap((page) => page.items)
    .find((m) => m.id === payload.momentId);
  if (!moment) return false;

  const updated = withRemoteReaction(moment, payload);
  if (!updated) return false;

  patchFeedMoment(queryClient, payload.momentId, () => updated);
  return true;
}
