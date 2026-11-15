import type { HttpClient } from "../http";
import type { Friend, FriendRequest, FriendRequestResult } from "../types";

interface FriendLike {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

function mapFriend(item: Record<string, unknown>): Friend {
  return {
    id: item.id as string,
    name: (item.name as string) ?? "Unknown",
    email: (item.email as string) ?? "",
    avatarUrl: (item.avatarUrl as string | null) ?? null,
    friendSince: (item.friendSince as string | null) ?? null,
  };
}

function mapRequest(item: Record<string, unknown>): FriendRequest {
  return {
    id: item.id as string,
    userId: (item.userId as string) ?? "",
    name: (item.name as string) ?? "Unknown",
    email: (item.email as string) ?? "",
    avatarUrl: (item.avatarUrl as string | null) ?? null,
    requestedAt: (item.requestedAt as string | null) ?? null,
  };
}

export interface FriendSearchResult {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  relationship: "none" | "friends" | "pending_inbound" | "pending_outbound";
  requestId: string | null;
}

export interface InviteTokenData {
  token: string;
  issuedAt: number;
  expiresAt: number;
}

export const createFriendsService = (http: HttpClient) => ({
  fetchFriends: async (): Promise<Friend[]> => {
    const data = await http.get<Record<string, unknown>[] | { data?: unknown }>(
      "/friends",
    );
    const arr = Array.isArray(data) ? data : [];
    return arr.map((item) => mapFriend(item as Record<string, unknown>));
  },

  fetchFriendRequests: async (): Promise<FriendRequest[]> => {
    const data = await http.get<Record<string, unknown>[]>("/friends/requests");
    const arr = Array.isArray(data) ? data : [];
    return arr.map((item) => mapRequest(item as Record<string, unknown>));
  },

  searchFriend: async (
    query: string,
    signal?: AbortSignal,
  ): Promise<FriendSearchResult[]> => {
    const data = await http.get<FriendSearchResult[]>(
      "/friends/search",
      { params: { q: query }, signal },
    );
    return Array.isArray(data) ? data : [];
  },

  addFriend: async (
    userId: string,
  ): Promise<{ friend: FriendLike; result: FriendRequestResult; requestId: string | null }> => {
    const json = await http.post<Record<string, unknown>>(
      "/friends",
      { userId },
      { unwrap: false },
    );
    const data = (json?.data ?? {}) as Record<string, unknown>;
    return {
      friend: mapFriend(data),
      result: (json?.result as FriendRequestResult) ?? "sent",
      requestId: (json?.requestId as string | null) ?? null,
    };
  },

  fetchSentRequests: async (): Promise<FriendRequest[]> => {
    const data = await http.get<Record<string, unknown>[]>("/friends/requests/sent");
    const arr = Array.isArray(data) ? data : [];
    return arr.map((item) => mapRequest(item as Record<string, unknown>));
  },

  cancelFriendRequest: (requestId: string): Promise<void> =>
    http.del<void>(`/friends/requests/${encodeURIComponent(requestId)}`),

  acceptFriendRequest: (requestId: string): Promise<void> =>
    http.post<void>(`/friends/requests/${encodeURIComponent(requestId)}/accept`),

  declineFriendRequest: (requestId: string): Promise<void> =>
    http.post<void>(`/friends/requests/${encodeURIComponent(requestId)}/decline`),

  deleteFriend: (friendId: string): Promise<void> =>
    http.del<void>(`/friends/${encodeURIComponent(friendId)}`),

  fetchInviteToken: async (): Promise<InviteTokenData> => {
    const json = await http.get<Record<string, unknown>>("/friends/invite", {
      unwrap: false,
    });
    const data = (json?.data ?? {}) as Record<string, unknown>;
    return {
      token: (data.token as string) ?? "",
      issuedAt: Number(data.issuedAt) || Date.now(),
      expiresAt: Number(data.expiresAt) || 0,
    };
  },

  claimInviteToken: async (
    token: string,
  ): Promise<{ result: FriendRequestResult; owner: FriendLike }> => {
    const json = await http.post<Record<string, unknown>>(
      "/friends/invite/claim",
      { token },
      { unwrap: false },
    );
    const data = (json?.data ?? {}) as Record<string, unknown>;
    return {
      result: (data.result as FriendRequestResult) ?? "sent",
      owner: mapFriend((data.owner as Record<string, unknown>) ?? {}),
    };
  },
});
