import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { momentInvitationsQueryKey, momentsFeedQueryKey, type Moment } from "@tng/shared";
import { useIsFocused } from "expo-router";
import * as Haptics from "expo-haptics";
import { useCallback, useMemo } from "react";

import { useSession } from "@/features/auth/session";
import { momentsApi } from "@/services";

import { patchFeedMoment, removeFeedMoment, withMyReaction } from "./momentsCache";
import { momentsFeedOptions } from "./momentsQuery";

/** No WebSocket on mobile yet → refresh the feed this often while the tab is open. */
const POLL_MS = 30_000;

/**
 * Moments feed (web `MomentsView`): same cache as the web (`momentsFeedQueryKey`),
 * polled while the tab is focused + on app foreground. Reactions are optimistic
 * (rolled back by a refetch on failure); delete (own) / leave (collab participant)
 * drop the card from the cache.
 */
export function useMomentsFeed() {
  const queryClient = useQueryClient();
  const focused = useIsFocused();
  const user = useSession().data?.user;

  const query = useInfiniteQuery({ ...momentsFeedOptions, refetchInterval: focused ? POLL_MS : false });
  const moments = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);

  const resync = useCallback(
    () => queryClient.invalidateQueries({ queryKey: momentsFeedQueryKey }),
    [queryClient],
  );

  const toggleReaction = useCallback(
    async (moment: Moment, emoji: string) => {
      if (!user) return;
      const removing = moment.myReaction === emoji;
      void Haptics.selectionAsync();
      patchFeedMoment(queryClient, moment.id, (m) =>
        withMyReaction(m, emoji, { id: user.id, name: user.name, image: user.image ?? null }),
      );
      try {
        if (removing) await momentsApi.removeMomentReaction(moment.id);
        else await momentsApi.reactToMoment(moment.id, { emoji });
      } catch {
        void resync();
      }
    },
    [queryClient, resync, user],
  );

  /** Creator: delete · participant: "leave" (take my photo back) or "delete" the shared moment. */
  const remove = useCallback(
    async (moment: Moment, action: "delete" | "leave" = moment.isOwn ? "delete" : "leave") => {
      if (action === "delete") await momentsApi.deleteMoment(moment.id);
      else await momentsApi.leaveMoment(moment.id);
      removeFeedMoment(queryClient, moment.id);
      void queryClient.invalidateQueries({ queryKey: momentInvitationsQueryKey });
    },
    [queryClient],
  );

  return { ...query, moments, toggleReaction, remove, refresh: resync, me: user?.id ?? null };
}
