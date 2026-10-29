import {
  Friend,
  FriendRequest,
  FriendRequestResult,
} from "@/types";
import { API_URL as BASE_URL } from "@/lib/config";

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
    name: (item.name as string) ?? "Unknown",
    email: (item.email as string) ?? "",
    avatarUrl: (item.avatarUrl as string | null) ?? null,
    requestedAt: (item.requestedAt as string | null) ?? null,
  };
}

export const fetchFriends = async (): Promise<Friend[]> => {
  const response = await fetch(`${BASE_URL}/friends`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const json = await response.json();
  const data = json.data ?? json;
  return (Array.isArray(data) ? data : []).map((item: Record<string, unknown>) =>
    mapFriend(item),
  );
};

export const fetchFriendRequests = async (): Promise<FriendRequest[]> => {
  const response = await fetch(`${BASE_URL}/friends/requests`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const json = await response.json();
  const data = json.data ?? json;
  return (Array.isArray(data) ? data : []).map((item: Record<string, unknown>) =>
    mapRequest(item),
  );
};

export interface FriendSearchResult {
  user: {
    id: string;
    name: string;
    email: string;
    avatar_url?: string | null;
  };
  relationship:
    | "none"
    | "self"
    | "friends"
    | "pending_inbound"
    | "pending_outbound";
}

export const searchFriend = async (
  query: string,
): Promise<FriendSearchResult | null> => {
  const response = await fetch(
    `${BASE_URL}/friends/search?q=${encodeURIComponent(query)}`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );

  if (!response.ok) {
    const json = await response.json().catch(() => null);
    const message =
      json?.error?.message ?? `HTTP error! status: ${response.status}`;
    throw new Error(message);
  }

  const json = await response.json();
  return json.data as FriendSearchResult;
};

export const addFriend = async (
  query: string,
): Promise<{ friend: FriendLike; result: FriendRequestResult }> => {
  const response = await fetch(`${BASE_URL}/friends`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const json = await response.json().catch(() => null);
    const message =
      json?.error?.message ?? `HTTP error! status: ${response.status}`;
    throw new Error(message);
  }

  const json = await response.json();
  return {
    friend: mapFriend(json.data as Record<string, unknown>),
    result: (json.result as FriendRequestResult) ?? "sent",
  };
};

export const acceptFriendRequest = async (requestId: string): Promise<void> => {
  const response = await fetch(
    `${BASE_URL}/friends/requests/${requestId}/accept`,
    {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
};

export const declineFriendRequest = async (requestId: string): Promise<void> => {
  const response = await fetch(
    `${BASE_URL}/friends/requests/${requestId}/decline`,
    {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
};

export const deleteFriend = async (friendId: string): Promise<void> => {
  const response = await fetch(`${BASE_URL}/friends/${friendId}`, {
    method: "DELETE",
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
};

export interface InviteTokenData {
  token: string;
  issuedAt: number;
  expiresAt: number;
}

export const fetchInviteToken = async (): Promise<InviteTokenData> => {
  const response = await fetch(`${BASE_URL}/friends/invite`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const json = await response.json();
  return {
    token: (json.data?.token as string) ?? "",
    issuedAt: Number(json.data?.issuedAt) || Date.now(),
    expiresAt: Number(json.data?.expiresAt) || 0,
  };
};

export const claimInviteToken = async (
  token: string,
): Promise<{ result: FriendRequestResult; owner: FriendLike }> => {
  const response = await fetch(`${BASE_URL}/friends/invite/claim`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    const json = await response.json().catch(() => null);
    const message =
      json?.error?.message ?? `HTTP error! status: ${response.status}`;
    const code = json?.error?.code as string | undefined;
    const err = new Error(message) as Error & { code?: string };
    if (code) err.code = code;
    throw err;
  }

  const json = await response.json();
  return {
    result: (json.data?.result as FriendRequestResult) ?? "sent",
    owner: mapFriend((json.data?.owner as Record<string, unknown>) ?? {}),
  };
};
