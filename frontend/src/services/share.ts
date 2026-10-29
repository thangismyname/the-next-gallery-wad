import { API_URL } from "@/lib/config";

/** Bạn bè có thể nhận ảnh (tab "Bạn bè" của ShareDialog). */
export interface ShareFriend {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
}

/** Lỗi trả về từ server (khác lỗi mạng) — `message` lấy từ backend. */
export class ShareHttpError extends Error {}

export async function fetchShareFriends(): Promise<ShareFriend[]> {
  const response = await fetch(`${API_URL}/share/friends`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new ShareHttpError(`HTTP ${response.status}`);
  const json = await response.json();
  const data = json.data ?? [];
  return Array.isArray(data) ? data : [];
}

/** Gửi ảnh trong thư viện cho bạn bè (lời mời "Xem ảnh" qua WebSocket). */
export async function shareToFriends(mediaIds: string[], friendIds: string[]): Promise<void> {
  const response = await fetch(`${API_URL}/share/to-friends`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ mediaIds, friendIds }),
  });
  if (!response.ok) {
    const json = await response.json().catch(() => null);
    throw new ShareHttpError(json?.error?.message ?? `HTTP error! status: ${response.status}`);
  }
}
