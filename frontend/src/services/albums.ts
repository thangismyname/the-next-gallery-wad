import { request } from "@/services/http";
import {
  mapMediaItem,
  resolveMediaUrl,
  type MediaListItem,
} from "@/services/media";

export type AlbumRole = "owner" | "editor" | "viewer";
export type MemberRole = Exclude<AlbumRole, "owner">;

/** Album thông minh: theo tag nội dung (AND) hoặc theo câu search kết hợp. */
export type SmartRule =
  | { type: "tags"; tags: string[]; minConfidence: number | null }
  | { type: "query"; query: string };

export interface Album {
  id: string;
  name: string;
  description: string | null;
  kind: "manual" | "smart";
  smartRule: SmartRule | null;
  coverMediaId: string | null;
  coverUrl: string | null;
  mediaCount: number;
  memberCount: number;
  role: AlbumRole;
  /** Lời mời chưa nhận. */
  pending: boolean;
  owner: { id: string; name: string | null; image: string | null };
  createdAt: string;
  updatedAt: string;
}

export interface AlbumLists {
  owned: Album[];
  shared: Album[];
  invitations: Album[];
}

export interface AlbumMediaItem extends MediaListItem {
  /** Chủ ảnh (album chung có ảnh của nhiều người). */
  ownerId?: string | null;
  addedBy?: string | null;
}

export interface AlbumMember {
  userId: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: AlbumRole;
  pending: boolean;
}

export interface ShareLink {
  id: string;
  token: string;
  permission: "view" | "download";
  expiresAt: string | null;
  maxViews: number | null;
  viewCount: number;
  createdAt: string;
}

export interface PublicAlbum {
  album: {
    name: string;
    description: string | null;
    owner: { name: string | null; image: string | null };
    permission: "view" | "download";
    expiresAt: string | null;
  };
  total: number;
  items: MediaListItem[];
}

export const albumsQueryKey = ["albums"] as const;
export const albumQueryKey = (id: string) => ["albums", id] as const;
export const albumMediaQueryKey = (id: string) =>
  ["albums", id, "media"] as const;
export const albumMembersQueryKey = (id: string) =>
  ["albums", id, "members"] as const;
export const albumLinksQueryKey = (id: string) =>
  ["albums", id, "links"] as const;

const mapAlbum = (album: Album): Album => ({
  ...album,
  coverUrl: album.coverUrl ? resolveMediaUrl(album.coverUrl) : null,
});

export const fetchAlbums = async (): Promise<AlbumLists> => {
  const data = await request<AlbumLists>("/albums");
  return {
    owned: data.owned.map(mapAlbum),
    shared: data.shared.map(mapAlbum),
    invitations: data.invitations.map(mapAlbum),
  };
};

export const fetchAlbum = async (id: string) =>
  mapAlbum(await request<Album>(`/albums/${id}`));

export const createAlbum = async (body: {
  name: string;
  description?: string;
  mediaIds?: string[];
  smartRule?: SmartRule;
}) =>
  mapAlbum(
    await request<Album>("/albums", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

export const updateAlbum = async (
  id: string,
  patch: {
    name?: string;
    description?: string | null;
    coverMediaId?: string | null;
    smartRule?: SmartRule;
  },
) =>
  mapAlbum(
    await request<Album>(`/albums/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  );

export const deleteAlbum = (id: string) =>
  request<null>(`/albums/${id}`, { method: "DELETE" });

export const convertAlbum = async (id: string) =>
  mapAlbum(await request<Album>(`/albums/${id}/convert`, { method: "POST" }));

export const fetchAlbumMedia = async (
  id: string,
  { limit = 60, offset = 0 }: { limit?: number; offset?: number } = {},
): Promise<{ total: number; items: AlbumMediaItem[] }> => {
  const data = await request<{
    total: number;
    items: Record<string, unknown>[];
  }>(`/albums/${id}/media?limit=${limit}&offset=${offset}`);
  return {
    total: data.total,
    items: data.items.map((item) => ({
      ...mapMediaItem(item),
      ownerId: (item.ownerId as string | null) ?? null,
      addedBy: (item.addedBy as string | null) ?? null,
    })),
  };
};

export const addAlbumMedia = (id: string, mediaIds: string[]) =>
  request<{ added: number }>(`/albums/${id}/media`, {
    method: "POST",
    body: JSON.stringify({ mediaIds }),
  });

export const removeAlbumMedia = (id: string, mediaIds: string[]) =>
  request<{ removed: number }>(`/albums/${id}/media/remove`, {
    method: "POST",
    body: JSON.stringify({ mediaIds }),
  });

export const fetchAlbumMembers = (id: string) =>
  request<AlbumMember[]>(`/albums/${id}/members`);

export const inviteAlbumMembers = (
  id: string,
  userIds: string[],
  role: MemberRole,
) =>
  request<AlbumMember[]>(`/albums/${id}/members`, {
    method: "POST",
    body: JSON.stringify({ userIds, role }),
  });

export const updateAlbumMember = (
  id: string,
  userId: string,
  role: MemberRole,
) =>
  request<null>(`/albums/${id}/members/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });

/** Owner gỡ thành viên; truyền id của chính mình = rời album. */
export const removeAlbumMember = (id: string, userId: string) =>
  request<null>(`/albums/${id}/members/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });

export const respondAlbumInvitation = (id: string, accept: boolean) =>
  request<null>(`/albums/${id}/invitation`, {
    method: "POST",
    body: JSON.stringify({ accept }),
  });

export const fetchAlbumLinks = (id: string) =>
  request<ShareLink[]>(`/albums/${id}/links`);

export const createAlbumLink = (
  id: string,
  body: {
    permission: "view" | "download";
    expiresInDays: number | null;
    maxViews: number | null;
  },
) =>
  request<ShareLink>(`/albums/${id}/links`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const deleteAlbumLink = (id: string, linkId: string) =>
  request<null>(`/albums/${id}/links/${linkId}`, { method: "DELETE" });

/** URL trang công khai của 1 link (gửi cho người không có tài khoản). */
export const publicAlbumUrl = (token: string) =>
  `${window.location.origin}/s/${token}`;

export const fetchPublicAlbum = async (
  token: string,
  { limit = 60, offset = 0 }: { limit?: number; offset?: number } = {},
): Promise<PublicAlbum> => {
  const data = await request<PublicAlbum>(
    `/public/albums/${encodeURIComponent(token)}?limit=${limit}&offset=${offset}`,
  );
  return {
    ...data,
    items: data.items.map((item) =>
      mapMediaItem(item as unknown as Record<string, unknown>),
    ),
  };
};

/** Lưu thứ tự mới của TOÀN BỘ ảnh trong album (owner, album thường). */
export const reorderAlbumMedia = (id: string, mediaIds: string[]) =>
  request<{ updated: number }>(`/albums/${id}/media/order`, {
    method: "PUT",
    body: JSON.stringify({ mediaIds }),
  });

export const albumsContainingQueryKey = (mediaId: string) =>
  ["albums", "containing", mediaId] as const;

/** Album (thường) chứa 1 ảnh mà mình xem được — Lightbox → Chi tiết. */
export const fetchAlbumsContaining = async (mediaId: string) =>
  (await request<Album[]>(`/albums/containing/${mediaId}`)).map(mapAlbum);

// ── Album tự động (tính từ dữ liệu sẵn có, chỉ đọc) ───────────────────
export type AutoAlbumGroup = "type" | "content" | "time" | "objects";

export interface AutoAlbum {
  /** "<loại>-<giá trị>": type-videos, tag-portrait, month-2026-10, event-202610291430, object-animal. */
  key: string;
  group: AutoAlbumGroup;
  count: number;
  coverUrl: string | null;
  firstAt: string;
  lastAt: string;
}

export const autoAlbumsQueryKey = ["albums", "auto"] as const;
export const autoAlbumMediaQueryKey = (key: string) =>
  ["albums", "auto", key, "media"] as const;

// Tháng / sự kiện tính theo giờ địa phương của trình duyệt.
const timeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

export const fetchAutoAlbums = async () => {
  const data = await request<{
    groups: { id: AutoAlbumGroup; albums: AutoAlbum[] }[];
  }>(`/albums/auto?tz=${encodeURIComponent(timeZone())}`);
  return data.groups.map((group) => ({
    ...group,
    albums: group.albums.map((album) => ({
      ...album,
      coverUrl: album.coverUrl ? resolveMediaUrl(album.coverUrl) : null,
    })),
  }));
};

export const fetchAutoAlbumMedia = async (
  key: string,
  { limit = 60, offset = 0 }: { limit?: number; offset?: number } = {},
): Promise<{ total: number; items: MediaListItem[] }> => {
  const data = await request<{
    total: number;
    items: Record<string, unknown>[];
  }>(
    `/albums/auto/${encodeURIComponent(key)}/media?limit=${limit}&offset=${offset}&tz=${encodeURIComponent(timeZone())}`,
  );
  return { total: data.total, items: data.items.map(mapMediaItem) };
};

/** Chốt album tự động thành album thường (tên đã dịch). */
export const saveAutoAlbum = async (key: string, name: string) =>
  mapAlbum(
    await request<Album>(`/albums/auto/${encodeURIComponent(key)}/save`, {
      method: "POST",
      body: JSON.stringify({ name, tz: timeZone() }),
    }),
  );
