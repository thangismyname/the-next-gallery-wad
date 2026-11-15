import type { HttpClient } from "../http";
import { mapMediaItem, resolveMediaUrl, type MediaListItem } from "./media";

export type AlbumRole = "owner" | "editor" | "viewer";
export type MemberRole = Exclude<AlbumRole, "owner">;

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
  pending: boolean;
  owner: { id: string; name: string | null; image: string | null };
  createdAt: string;
  updatedAt: string;
}

export interface SmartRulePreview {
  total: number;
  thumbnails: { id: string; url: string }[];
}

export interface AlbumLists {
  owned: Album[];
  shared: Album[];
  invitations: Album[];
}

export interface AlbumMediaItem extends MediaListItem {
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
export const albumMediaQueryKey = (id: string) => ["albums", id, "media"] as const;
export const albumMembersQueryKey = (id: string) => ["albums", id, "members"] as const;
export const albumLinksQueryKey = (id: string) => ["albums", id, "links"] as const;

const mapAlbum = (album: Album): Album => ({
  ...album,
  coverUrl: album.coverUrl ? resolveMediaUrl(album.coverUrl) : null,
});

export const createAlbumsService = (http: HttpClient) => ({
  fetchAlbums: async (): Promise<AlbumLists> => {
    const data = await http.get<AlbumLists>("/albums");
    return {
      owned: (data?.owned ?? []).map(mapAlbum),
      shared: (data?.shared ?? []).map(mapAlbum),
      invitations: (data?.invitations ?? []).map(mapAlbum),
    };
  },

  fetchAlbum: async (id: string): Promise<Album> =>
    mapAlbum(await http.get<Album>(`/albums/${encodeURIComponent(id)}`)),

  createAlbum: async (body: {
    name: string;
    description?: string;
    mediaIds?: string[];
    smartRule?: SmartRule;
  }): Promise<Album> =>
    mapAlbum(await http.post<Album>("/albums", body)),

  updateAlbum: async (
    id: string,
    patch: {
      name?: string;
      description?: string | null;
      coverMediaId?: string | null;
      smartRule?: SmartRule;
    },
  ): Promise<Album> =>
    mapAlbum(await http.patch<Album>(`/albums/${encodeURIComponent(id)}`, patch)),

  /** Photos a smart rule matches right now (count + a few thumbnails) — form preview before saving. */
  previewSmartRule: async (smartRule: SmartRule): Promise<SmartRulePreview> => {
    const data = await http.post<SmartRulePreview>("/albums/smart/preview", { smartRule });
    return {
      total: data?.total ?? 0,
      thumbnails: (data?.thumbnails ?? []).map((th) => ({ id: th.id, url: resolveMediaUrl(th.url) })),
    };
  },

  deleteAlbum: (id: string): Promise<null> =>
    http.del<null>(`/albums/${encodeURIComponent(id)}`),

  convertAlbum: async (id: string): Promise<Album> =>
    mapAlbum(await http.post<Album>(`/albums/${encodeURIComponent(id)}/convert`)),

  fetchAlbumMedia: async (
    id: string,
    { limit = 60, offset = 0 }: { limit?: number; offset?: number } = {},
  ): Promise<{ total: number; items: AlbumMediaItem[] }> => {
    const data = await http.get<{ total: number; items: Record<string, unknown>[] }>(
      `/albums/${encodeURIComponent(id)}/media`,
      { params: { limit, offset } },
    );
    return {
      total: data.total,
      items: (data.items ?? []).map((item) => ({
        ...mapMediaItem(item),
        ownerId: (item.ownerId as string | null) ?? null,
        addedBy: (item.addedBy as string | null) ?? null,
      })),
    };
  },

  addAlbumMedia: (id: string, mediaIds: string[]): Promise<{ added: number }> =>
    http.post<{ added: number }>(`/albums/${encodeURIComponent(id)}/media`, {
      mediaIds,
    }),

  removeAlbumMedia: (id: string, mediaIds: string[]): Promise<{ removed: number }> =>
    http.post<{ removed: number }>(
      `/albums/${encodeURIComponent(id)}/media/remove`,
      { mediaIds },
    ),

  fetchAlbumMembers: (id: string): Promise<AlbumMember[]> =>
    http.get<AlbumMember[]>(`/albums/${encodeURIComponent(id)}/members`),

  inviteAlbumMembers: (
    id: string,
    userIds: string[],
    role: MemberRole,
  ): Promise<AlbumMember[]> =>
    http.post<AlbumMember[]>(`/albums/${encodeURIComponent(id)}/members`, {
      userIds,
      role,
    }),

  updateAlbumMember: (
    id: string,
    userId: string,
    role: MemberRole,
  ): Promise<null> =>
    http.patch<null>(
      `/albums/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`,
      { role },
    ),

  removeAlbumMember: (id: string, userId: string): Promise<null> =>
    http.del<null>(
      `/albums/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`,
    ),

  respondAlbumInvitation: (id: string, accept: boolean): Promise<null> =>
    http.post<null>(`/albums/${encodeURIComponent(id)}/invitation`, { accept }),

  fetchAlbumLinks: (id: string): Promise<ShareLink[]> =>
    http.get<ShareLink[]>(`/albums/${encodeURIComponent(id)}/links`),

  createAlbumLink: (
    id: string,
    body: {
      permission: "view" | "download";
      expiresInDays: number | null;
      maxViews: number | null;
    },
  ): Promise<ShareLink> =>
    http.post<ShareLink>(`/albums/${encodeURIComponent(id)}/links`, body),

  deleteAlbumLink: (id: string, linkId: string): Promise<null> =>
    http.del<null>(`/albums/${encodeURIComponent(id)}/links/${encodeURIComponent(linkId)}`),

  publicAlbumUrl: (token: string): string => {
    const origin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "";
    return `${origin}/s/${token}`;
  },

  fetchPublicAlbum: async (
    token: string,
    { limit = 60, offset = 0 }: { limit?: number; offset?: number } = {},
  ): Promise<PublicAlbum> => {
    const data = await http.get<PublicAlbum>(
      `/public/albums/${encodeURIComponent(token)}`,
      { params: { limit, offset } },
    );
    return {
      ...data,
      items: (data?.items ?? []).map((item) =>
        mapMediaItem(item as unknown as Record<string, unknown>),
      ),
    };
  },

  reorderAlbumMedia: (
    id: string,
    mediaIds: string[],
  ): Promise<{ updated: number }> =>
    http.put<{ updated: number }>(`/albums/${encodeURIComponent(id)}/media/order`, {
      mediaIds,
    }),

  fetchAlbumsContaining: async (mediaId: string): Promise<Album[]> =>
    (await http.get<Album[]>(`/albums/containing/${encodeURIComponent(mediaId)}`)).map(
      mapAlbum,
    ),

  // ── Auto albums ─────────────────────────────────────────────
  fetchAutoAlbums: async () => {
    const tz = (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      } catch {
        return "UTC";
      }
    })();
    const data = await http.get<{
      groups: { id: AutoAlbumGroup; albums: AutoAlbum[] }[];
    }>(`/albums/auto`, { params: { tz } });
    return (data?.groups ?? []).map((group) => ({
      ...group,
      albums: (group.albums ?? []).map((album) => ({
        ...album,
        coverUrl: album.coverUrl ? resolveMediaUrl(album.coverUrl) : null,
      })),
    }));
  },

  fetchAutoAlbumMedia: async (
    key: string,
    { limit = 60, offset = 0 }: { limit?: number; offset?: number } = {},
  ): Promise<{ total: number; items: MediaListItem[] }> => {
    const tz = (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      } catch {
        return "UTC";
      }
    })();
    const data = await http.get<{ total: number; items: Record<string, unknown>[] }>(
      `/albums/auto/${encodeURIComponent(key)}/media`,
      { params: { limit, offset, tz } },
    );
    return { total: data.total, items: (data.items ?? []).map(mapMediaItem) };
  },

  saveAutoAlbum: async (key: string, name: string): Promise<Album> => {
    const tz = (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      } catch {
        return "UTC";
      }
    })();
    return mapAlbum(
      await http.post<Album>(`/albums/auto/${encodeURIComponent(key)}/save`, {
        name,
        tz,
      }),
    );
  },
});

export type AutoAlbumGroup = "type" | "content" | "time" | "objects";

export interface AutoAlbum {
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
