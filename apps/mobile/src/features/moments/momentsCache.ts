// In-place updates of the Moments feed cache (web `features/moments/momentsCache.ts`).
// The feed is an infinite query → { pages: [{ items }] }, so updates go through
// `pages[].items`.
import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { momentsFeedQueryKey, type Moment, type MomentFeedResponse } from "@tng/shared";

export function patchFeedMoment(queryClient: QueryClient, momentId: string, updater: (moment: Moment) => Moment) {
  queryClient.setQueriesData<InfiniteData<MomentFeedResponse>>({ queryKey: momentsFeedQueryKey }, (old) =>
    old?.pages
      ? {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.map((m) => (m.id === momentId ? updater(m) : m)),
          })),
        }
      : old,
  );
}

export function removeFeedMoment(queryClient: QueryClient, momentId: string) {
  queryClient.setQueriesData<InfiniteData<MomentFeedResponse>>({ queryKey: momentsFeedQueryKey }, (old) =>
    old?.pages
      ? { ...old, pages: old.pages.map((page) => ({ ...page, items: page.items.filter((m) => m.id !== momentId) })) }
      : old,
  );
}

type Me = { id: string; name: string; image: string | null };

/**
 * My reaction set to `emoji` (or removed when it equals my current one): counts,
 * my bubble first in `recentReactions` (max 4). One reaction per user — switching
 * emoji moves my count from the old one to the new one.
 */
export function withMyReaction(m: Moment, emoji: string, me: Me): Moment {
  const removing = m.myReaction === emoji;
  const reactions = m.reactions.map((r) => ({ ...r }));
  const bump = (e: string, delta: number) => {
    const i = reactions.findIndex((r) => r.emoji === e);
    if (i < 0) {
      if (delta > 0) reactions.push({ emoji: e, count: delta });
      return;
    }
    reactions[i].count += delta;
    if (reactions[i].count <= 0) reactions.splice(i, 1);
  };
  if (m.myReaction) bump(m.myReaction, -1);
  if (!removing) bump(emoji, 1);
  reactions.sort((a, b) => b.count - a.count);

  const others = m.recentReactions.filter((r) => r.userId !== me.id);
  const recentReactions = removing
    ? others
    : [{ emoji, userId: me.id, userName: me.name, userAvatarUrl: me.image }, ...others].slice(0, 4);

  return { ...m, myReaction: removing ? null : emoji, reactions, recentReactions };
}
