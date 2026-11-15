// Dữ liệu + thao tác trang Bạn bè (react-query): bạn bè, lời mời đến, lời mời
// đã gửi; kết bạn (theo id từ kết quả tìm), chấp nhận / từ chối / huỷ lời mời,
// huỷ kết bạn. Realtime (WS friend:*) chỉ cần invalidate `friendsKeys.all`
// (FriendEventsToast).
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { acceptFriendRequest, addFriend, cancelFriendRequest, declineFriendRequest, deleteFriend, fetchFriendRequests, fetchFriends, fetchSentRequests, searchFriend } from "@/services/friends";
import { useDebounce } from "@/hooks/useDebounce";
import type { Friend, FriendRequest, FriendRequestResult } from "@tng/shared";

export const friendsKeys = {
  all: ["friends"] as const,
  list: ["friends", "list"] as const,
  requests: ["friends", "requests"] as const,
  sent: ["friends", "requests", "sent"] as const,
  search: (q: string) => ["friends", "search", q] as const,
};

export type Notice = { tone: "ok" | "error"; text: string } | null;

export function useFriends() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice>(null);

  const list = useQuery({ queryKey: friendsKeys.list, queryFn: fetchFriends, staleTime: 30_000 });
  const incoming = useQuery({ queryKey: friendsKeys.requests, queryFn: fetchFriendRequests, staleTime: 15_000 });
  const sent = useQuery({ queryKey: friendsKeys.sent, queryFn: fetchSentRequests, staleTime: 15_000 });

  const friends: Friend[] = useMemo(() => list.data ?? [], [list.data]);
  const requests: FriendRequest[] = useMemo(() => incoming.data ?? [], [incoming.data]);
  const sentRequests: FriendRequest[] = useMemo(() => sent.data ?? [], [sent.data]);

  const refreshAll = useCallback(
    () => queryClient.invalidateQueries({ queryKey: friendsKeys.all }),
    [queryClient],
  );

  /** Chạy 1 thao tác theo id (khoá nút đó), làm mới mọi danh sách khi xong. */
  const run = useCallback(
    async (id: string, kind: string, fn: () => Promise<string | void>) => {
      setBusy((b) => ({ ...b, [id]: kind }));
      try {
        const text = await fn();
        if (text) setNotice({ tone: "ok", text });
        await refreshAll();
      } catch (err) {
        setNotice({ tone: "error", text: err instanceof Error ? err.message : t("friends.actionFailed") });
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

  const add = (userId: string) =>
    run(userId, "add", async () => {
      const { friend, result } = await addFriend(userId);
      return resultText(result, friend.name);
    });

  const accept = (r: FriendRequest) =>
    run(r.id, "accept", async () => {
      await acceptFriendRequest(r.id);
      return t("friends.nowFriends", { name: r.name });
    });

  const decline = (r: FriendRequest) => run(r.id, "decline", () => declineFriendRequest(r.id));
  const cancel = (r: FriendRequest) => run(r.id, "cancel", () => cancelFriendRequest(r.id));

  const unfriend = (f: Friend) =>
    run(f.id, "delete", async () => {
      await deleteFriend(f.id);
      return t("friends.deleted", { name: f.name });
    });

  return {
    friends,
    requests,
    sentRequests,
    listState: { pending: list.isPending, error: list.isError, retry: () => void list.refetch() },
    requestsState: {
      pending: incoming.isPending || sent.isPending,
      error: incoming.isError || sent.isError,
      retry: () => void Promise.all([incoming.refetch(), sent.refetch()]),
    },
    busy,
    notice,
    clearNotice: () => setNotice(null),
    add,
    accept,
    decline,
    cancel,
    unfriend,
  };
}

/** Tìm người khi gõ (đợi 400 ms): email đầy đủ, hoặc tên ≥ 2 ký tự. */
export function useFriendSearch(query: string) {
  const q = useDebounce(query.trim(), 400);
  const enabled = q.includes("@") ? q.length >= 3 : q.length >= 2;
  const search = useQuery({
    queryKey: friendsKeys.search(q),
    queryFn: ({ signal }) => searchFriend(q, signal),
    enabled,
    staleTime: 15_000,
  });
  return {
    results: enabled ? (search.data ?? []) : [],
    searching: enabled && search.isFetching,
    error: enabled && search.isError ? (search.error as Error).message : null,
    tooShort: query.trim().length > 0 && !enabled,
    debouncedQuery: q,
  };
}
