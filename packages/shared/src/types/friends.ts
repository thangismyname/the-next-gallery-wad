export interface Friend {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  friendSince?: string | null;
}

export interface FriendRequest {
  /** Id lời mời. */
  id: string;
  /** Người gửi (lời mời đến) / người nhận (lời mời đã gửi). */
  userId: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  requestedAt?: string | null;
}

export type FriendRequestResult =
  | "sent"
  | "accepted"
  | "already_friends"
  | "pending_inbound"
  | "pending_outbound";