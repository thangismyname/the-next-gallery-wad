import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HttpError, type Friend, type FriendRequest, type FriendRequestResult } from "@tng/shared";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { friendsApi } from "@/services";

/** Same keys as the web `features/friends/useFriends.ts` (invalidate `friendsKeys.all`). */
export const friendsKeys = {
  all: ["friends"] as const,
  list: ["friends", "list"] as const,
  requests: ["friends", "requests"] as const,
  sent: ["friends", "requests", "sent"] as const,
  search: (q: string) => ["friends", "search", q] as const,
  invite: ["friends", "invite"] as const,
};

export type Notice = { tone: "ok" | "error"; text: string } | null;

/** Incoming request count (Account sheet badge). */
export function useIncomingRequestCount() {
  const q = useQuery({ queryKey: friendsKeys.requests, queryFn: friendsApi.fetchFriendRequests, staleTime: 15_000 });
  return q.data?.length ?? 0;
}

/**
 * Friends screen data + actions (web `useFriends`): friends, incoming / sent
 * requests; add (by id from a search result), accept / decline / cancel,
 * unfriend. Each action locks its row (`busy[id]`), refreshes every list and
 * leaves a short notice.
 */
export function useFriends() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice>(null);

  const list = useQuery({ queryKey: friendsKeys.list, queryFn: friendsApi.fetchFriends, staleTime: 30_000 });
  const incoming = useQuery({ queryKey: friendsKeys.requests, queryFn: friendsApi.fetchFriendRequests, staleTime: 15_000 });
  const sent = useQuery({ queryKey: friendsKeys.sent, queryFn: friendsApi.fetchSentRequests, staleTime: 15_000 });

  const friends: Friend[] = useMemo(() => list.data ?? [], [list.data]);
  const requests: FriendRequest[] = useMemo(() => incoming.data ?? [], [incoming.data]);
  const sentRequests: FriendRequest[] = useMemo(() => sent.data ?? [], [sent.data]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  const refreshAll = useCallback(() => queryClient.invalidateQueries({ queryKey: friendsKeys.all }), [queryClient]);

  const run = useCallback(
    async (id: string, kind: string, fn: () => Promise<string | void>) => {
      setBusy((b) => ({ ...b, [id]: kind }));
      try {
        const text = await fn();
        if (text) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setNotice({ tone: "ok", text });
        }
        await refreshAll();
      } catch (err) {
        const text = err instanceof HttpError && err.status > 0 && err.status < 500 ? err.message : t("friends.actionFailed");
        setNotice({ tone: "error", text });
      } finally {
        setBusy((b) => {
          const next = { ...b };
          delete next[id];
          return next;
        });
      }
    },
    [refreshAll, t],
  );

  const resultText = useCallback(
    (result: FriendRequestResult, name: string) =>
      ({
        sent: t("friends.sent", { name }),
        accepted: t("friends.nowFriends", { name }),
        already_friends: t("friends.alreadyFriends", { name }),
        pending_inbound: t("friends.pendingInbound", { name }),
        pending_outbound: t("friends.pendingOutbound", { name }),
      })[result],
    [t],
  );

  return {
    friends,
    requests,
    sentRequests,
    listState: { pending: list.isPending, error: list.isError, refetch: list.refetch },
    requestsState: {
      pending: incoming.isPending || sent.isPending,
      error: incoming.isError || sent.isError,
      refetch: () => Promise.all([incoming.refetch(), sent.refetch()]),
    },
    refreshAll,
    busy,
    notice,
    clearNotice: () => setNotice(null),
    add: (userId: string) =>
      run(userId, "add", async () => {
        const { friend, result } = await friendsApi.addFriend(userId);
        return resultText(result, friend.name);
      }),
    accept: (r: FriendRequest) =>
      run(r.id, "accept", async () => {
        await friendsApi.acceptFriendRequest(r.id);
        return t("friends.nowFriends", { name: r.name });
      }),
    decline: (r: FriendRequest) => run(r.id, "decline", () => friendsApi.declineFriendRequest(r.id)),
    cancel: (r: FriendRequest) => run(r.id, "cancel", () => friendsApi.cancelFriendRequest(r.id)),
    unfriend: (f: Friend) =>
      run(f.id, "delete", async () => {
        await friendsApi.deleteFriend(f.id);
        return t("friends.deleted", { name: f.name });
      }),
  };
}

/** Search while typing (400 ms): a full email, or a name of ≥ 2 characters. */
export function useFriendSearch(query: string) {
  const [q, setQ] = useState(query.trim());
  useEffect(() => {
    const timer = setTimeout(() => setQ(query.trim()), 400);
    return () => clearTimeout(timer);
  }, [query]);
  const enabled = q.includes("@") ? q.length >= 3 : q.length >= 2;
  const search = useQuery({
    queryKey: friendsKeys.search(q),
    queryFn: ({ signal }) => friendsApi.searchFriend(q, signal),
    enabled,
    staleTime: 15_000,
  });
  return {
    results: enabled ? (search.data ?? []) : [],
    searching: enabled && search.isFetching,
    error: enabled && search.isError,
    tooShort: query.trim().length > 0 && !enabled,
    searched: enabled && !search.isFetching && search.isSuccess,
  };
}

/** Invite token for the QR / link (web `FriendInviteCard`), re-issued on demand. */
export function useFriendInvite() {
  return useQuery({ queryKey: friendsKeys.invite, queryFn: friendsApi.fetchInviteToken, staleTime: 60_000 });
}
