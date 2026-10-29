import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acceptFriendRequest,
  addFriend,
  declineFriendRequest,
  deleteFriend,
  fetchFriendRequests,
  fetchFriends,
  FriendSearchResult,
  searchFriend,
} from "@/services/friends";
import { Friend, FriendRequest, FriendRequestResult } from "@/types";

const friendsQueryKey = ["friends", "list"] as const;
const requestsQueryKey = ["friends", "requests"] as const;


function notifyLabels(t: ReturnType<typeof useTranslation>["t"]) {
  return (result: FriendRequestResult, name: string) => {
    switch (result) {
      case "already_friends":
        return t("friends.alreadyFriends", { name });
      case "pending_inbound":
        return t("friends.pendingInbound", { name });
      case "pending_outbound":
        return t("friends.pendingOutbound", { name });
      case "sent":
      default:
        return t("friends.sent", { name });
    }
  };
}

/**
 * Dữ liệu + thao tác trang Bạn bè: danh sách bạn, lời mời đến, tìm theo
 * email / mã → gửi lời mời, chấp nhận / từ chối, xoá bạn (có xác nhận).
 * Lỗi từ server được đổi sang câu đã dịch khi nhận ra (không tìm thấy, tự
 * thêm chính mình).
 */
export function useFriends() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: friendsQueryKey });
    queryClient.invalidateQueries({ queryKey: requestsQueryKey });
  };

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: friendsQueryKey,
    queryFn: fetchFriends,
    staleTime: 30_000,
  });

  const {
    data: requestsData,
    isPending: requestsPending,
    isError: requestsError,
    refetch: refetchRequests,
  } = useQuery({
    queryKey: requestsQueryKey,
    queryFn: fetchFriendRequests,
    staleTime: 15_000,
  });

  const friends: Friend[] = useMemo(() => data ?? [], [data]);
  const requests: FriendRequest[] = useMemo(
    () => requestsData ?? [],
    [requestsData],
  );

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<FriendSearchResult | null>(
    null,
  );
  const [adding, setAdding] = useState(false);
  const [addMessage, setAddMessage] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Friend | null>(null);
  const [deleting, setDeleting] = useState(false);

  const submitting = (value: string, id: string) => {
    setBusy((prev) => ({ ...prev, [id]: value }));
  };
  const [busy, setBusy] = useState<Record<string, string>>({});

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setSearching(true);
    setAddError(null);
    setAddMessage(null);
    setSearchResult(null);
    try {
      const result = await searchFriend(trimmed);
      setSearchResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const key = message.toLowerCase();
      if (key.includes("không tìm thấy") || key.includes("no user found")) {
        setAddError(t("friends.notFound"));
      } else {
        setAddError(message);
      }
    } finally {
      setSearching(false);
    }
  };

  const confirmSend = async () => {
    if (!searchResult) return;
    setAdding(true);
    setAddError(null);
    setAddMessage(null);
    try {
      const { friend, result } = await addFriend(query.trim());
      setAddMessage(notifyLabels(t)(result, friend.name));
      setQuery("");
      setSearchResult(null);
      invalidateAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const key = message.toLowerCase();
      if (key.includes("không tìm thấy") || key.includes("no user found")) {
        setAddError(t("friends.notFound"));
      } else if (key.includes("chính mình") || key.includes("add yourself")) {
        setAddError(t("friends.self"));
      } else {
        setAddError(message);
      }
    } finally {
      setAdding(false);
    }
  };

  const handleRespond = async (
    request: FriendRequest,
    action: "accept" | "decline",
  ) => {
    submitting(action, request.id);
    try {
      if (action === "accept") {
        await acceptFriendRequest(request.id);
      } else {
        await declineFriendRequest(request.id);
      }
      invalidateAll();
    } catch (error) {
      console.error("Failed to respond to request:", error);
    } finally {
      setBusy((prev) => {
        const next = { ...prev };
        delete next[request.id];
        return next;
      });
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteFriend(toDelete.id);
      invalidateAll();
      setToDelete(null);
    } catch (error) {
      console.error("Failed to delete friend:", error);
    } finally {
      setDeleting(false);
    }
  };

  return {
    friends,
    requests,
    isPending,
    isError,
    refetch,
    requestsPending,
    requestsError,
    refetchRequests,
    query,
    setQuery,
    searching,
    searchResult,
    adding,
    addMessage,
    addError,
    handleSearch,
    confirmSend,
    busy,
    handleRespond,
    toDelete,
    setToDelete,
    deleting,
    confirmDelete,
  };
}
