import type { HttpClient } from "../http";
import type { Media } from "../types";

/** Múi giờ IANA của máy (auto album, tìm theo ngày) — lỗi Intl → "UTC". */
export function clientTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

let mediaBaseUrl = "";

/** Configure the base URL used to resolve relative media URLs (web: AUTH_BASE_URL, mobile: API origin). */
export function setMediaBaseUrl(base: string): void {
  mediaBaseUrl = (base || "").replace(/\/+$/, "");
}

export function resolveMediaUrl(url?: string, base?: string): string {
  if (!url) return "";
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("blob:") ||
    url.startsWith("data:")
  ) {
    return url;
  }
  const b = (base ?? mediaBaseUrl).replace(/\/+$/, "");
  return b ? `${b}${url.startsWith("/") ? "" : "/"}${url}` : url;
}

export function mapMediaItem(item: Record<string, unknown>): MediaListItem {
  return {
    ...item,
    isFavorite: Boolean(item.isFavorite),
    createdAt: (item.createdAt as string | null) ?? null,
    takenAt: (item.takenAt as string | null) ?? null,
    aiTags: Array.isArray(item.aiTags) ? (item.aiTags as string[]) : [],
    url: resolveMediaUrl(item.url as string | undefined),
    thumbnailUrl: resolveMediaUrl(
      (item.thumbnailUrl as string | undefined) || (item.url as string | undefined),
    ),
    thumbnailUrlLarge: (item.thumbnailUrlLarge as string | undefined)
      ? resolveMediaUrl(item.thumbnailUrlLarge as string)
      : undefined,
    displayUrl: (item.displayUrl as string | null | undefined)
      ? resolveMediaUrl(item.displayUrl as string)
      : null,
    fullUrl: (item.fullUrl as string | null | undefined)
      ? resolveMediaUrl(item.fullUrl as string)
      : null,
    motionUrl: item.motionUrl ? resolveMediaUrl(item.motionUrl as string) : null,
  } as MediaListItem;
}

export interface MediaListItem {
  id: string;
  mediaType: "photo" | "video";
  mimeType?: string | null;
  title: string | null;
  url: string;
  thumbnailUrl: string;
  thumbnailUrlLarge?: string;
  displayUrl?: string | null;
  fullUrl?: string | null;
  width?: number;
  height?: number;
  durationSeconds?: number | null;
  sizeBytes?: number;
  isFavorite: boolean;
  createdAt?: string | null;
  takenAt?: string | null;
  aiTags: string[];
  /** Lần chỉnh gần nhất (basic edit); null = ảnh gốc. */
  editedAt?: string | null;
  score?: number | null;
  /** Description (Google Takeout import…). */
  caption?: string | null;
  /** Where it was taken (WGS84). */
  location?: { lat: number; lng: number } | null;
  /** Live Photo video (signed URL) — play it in the lightbox. */
  motionUrl?: string | null;
  scoreParts?: { clip: number; tag?: number; object?: number; label?: number } | null;
}

/** Basic edit — khớp backend `media.schema.js::editRecipeSchema` (đổi cả 2). */
export interface EditRecipe {
  v: 1;
  /** EV, −3…3 */
  exposure: number;
  /** các thông số còn lại −100…100, 0 = không chỉnh */
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  temperature: number;
  tint: number;
  vibrance: number;
  saturation: number;
  vignette: number;
}

export interface MediaEdit {
  recipe: EditRecipe | null;
  updatedAt: string | null;
  sourceUrl: string;
}

export interface MediaPage {
  items: MediaListItem[];
  total?: number;
  hasMore: boolean;
  limit: number;
  offset: number;
}

export interface TrashItem extends MediaListItem {
  deletedAt: string;
}

export interface AlbumCover {
  id: string;
  name: string;
  coverUrl: string | null;
}

export interface AlbumSearchResult {
  id: string;
  name: string;
  description: string;
  coverUrl: string | null;
  mediaCount: number;
}

export type GallerySort = "newest" | "oldest" | "name_asc" | "name_desc";
export type MediaFilter = "all" | "favorites" | "photos" | "videos";

export function toMedia(item: MediaListItem): Media {
  return {
    ...item,
    altText: item.title ?? "Gallery photo",
    width: item.width ?? 800,
    height: item.height ?? 600,
  };
}

export interface ObjectDetection {
  class_name: string;
  confidence: number;
  bbox: number[];
  model: string;
}

export interface SimilarMediaResult {
  source: "dinov3" | "clip" | null;
  model: string | null;
  items: MediaListItem[];
}

export interface TagSummary {
  tag: string;
  count: number;
  threshold: number;
  coverUrl: string | null;
  topConfidence: number;
}

/** Nhãn chi tiết (Open Images) — id "oi.<tên>", tên theo ngôn ngữ, nhóm hiển thị. */
export interface TagLabel {
  id: string;
  section: string;
  // Tên từ ai-service labels.csv (vi / en / ja) — ngôn ngữ khác (zh) rơi về en.
  names: { en: string; vi: string; ja: string } & Partial<Record<string, string>>;
  threshold: number;
}

export interface TagCatalog {
  model: string | null;
  sections: string[];
  labels: TagLabel[];
  labelModel: {
    source: string;
    clipModel: string;
    precisionTarget: number;
    precision: number | null;
    mAP: number | null;
  } | null;
}

/** 1 tag của 1 ảnh (danh mục hoặc nhãn chi tiết "oi.*"). */
export interface MediaTag {
  tag: string;
  confidence: number;
  threshold: number;
}

export const LABEL_TAG_PREFIX = "oi.";
export const isLabelTag = (tag: string) => tag.startsWith(LABEL_TAG_PREFIX);

export interface TagMediaPage {
  items: MediaListItem[];
  total: number;
}

export const tagSummaryQueryKey = ["ai", "tags", "summary"] as const;
export const tagMediaQueryKey = (tag: string, minConfidence: number | null) =>
  ["ai", "tags", "media", tag, minConfidence] as const;
export const tagCatalogQueryKey = ["ai", "tags", "catalog"] as const;
export const mediaTagsQueryKey = (mediaId: string) => ["ai", "tags", "of", mediaId] as const;
export const trashQueryKey = ["trash", "media"] as const;

/** Max ids per bulk request (backend `mediaIdsSchema` / `favoriteSchema`). */
export const BULK_IDS_MAX = 100;

/** Run `send` on ≤ `BULK_IDS_MAX` ids at a time, in order (stops at the first error). */
export async function inChunks(ids: string[], send: (chunk: string[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < ids.length; i += BULK_IDS_MAX) await send(ids.slice(i, i + BULK_IDS_MAX));
}

export const createMediaService = (http: HttpClient) => ({
  fetchMedia: async (
    offset = 0,
    limit = 40,
    sort?: GallerySort,
  ): Promise<MediaPage> => {
    const params: Record<string, string> = {
      offset: String(offset),
      limit: String(limit),
    };
    if (sort) params.sort = sort;
    const data = await http.get<{
      items?: Record<string, unknown>[];
      total?: number;
      hasMore?: boolean;
      limit?: number;
      offset?: number;
    }>("/gallery/media", { params });
    const items = (Array.isArray(data?.items) ? data.items : []).map(mapMediaItem);
    return {
      items,
      total: typeof data?.total === "number" ? data.total : undefined,
      hasMore: Boolean(data?.hasMore),
      limit: data?.limit ?? limit,
      offset: data?.offset ?? offset,
    };
  },

  fetchMediaByIds: async (ids: string[]): Promise<MediaListItem[]> => {
    if (ids.length === 0) return [];
    const data = await http.post<{ items?: Record<string, unknown>[] }>(
      "/gallery/media/lookup",
      { ids },
    );
    return (Array.isArray(data?.items) ? data.items : []).map(mapMediaItem);
  },

  uploadMedia: async (files: File[]): Promise<string[]> => {
    const formData = new FormData();
    files.forEach((file) => formData.append("media", file));
    const data = await http.upload<{ uploaded?: { id: string }[] }>(
      "/gallery/media",
      formData,
    );
    return (data?.uploaded ?? []).map((item) => item.id);
  },

  fetchFavorites: async (offset = 0, limit = 40): Promise<MediaPage> => {
    const data = await http.get<{
      items?: Record<string, unknown>[];
      hasMore?: boolean;
      limit?: number;
      offset?: number;
    }>(`/gallery/media/favorites`, { params: { offset, limit } });
    const items = (Array.isArray(data?.items) ? data.items : []).map(mapMediaItem);
    return {
      items,
      hasMore: Boolean(data?.hasMore),
      limit: data?.limit ?? limit,
      offset: data?.offset ?? offset,
    };
  },

  fetchMediaByFilter: async (
    filter: MediaFilter,
    offset = 0,
    limit = 100,
  ): Promise<MediaPage> => {
    if (filter === "favorites") {
      const data = await http.get<{
        items?: Record<string, unknown>[];
        hasMore?: boolean;
        limit?: number;
        offset?: number;
      }>(`/gallery/media/favorites`, { params: { offset, limit } });
      const items = (Array.isArray(data?.items) ? data.items : []).map(mapMediaItem);
      return {
        items,
        hasMore: Boolean(data?.hasMore),
        limit: data?.limit ?? limit,
        offset: data?.offset ?? offset,
      };
    }
    const params: Record<string, string> = {
      offset: String(offset),
      limit: String(limit),
    };
    if (filter === "photos" || filter === "videos") {
      params.type = filter === "photos" ? "photo" : "video";
    }
    const data = await http.get<{
      items?: Record<string, unknown>[];
      hasMore?: boolean;
      limit?: number;
      offset?: number;
    }>(`/gallery/media`, { params });
    const items = (Array.isArray(data?.items) ? data.items : []).map(mapMediaItem);
    return {
      items,
      hasMore: Boolean(data?.hasMore),
      limit: data?.limit ?? limit,
      offset: data?.offset ?? offset,
    };
  },

  fetchAlbumCovers: async (limit = 20): Promise<{ items: AlbumCover[] }> => {
    try {
      const data = await http.get<{ items?: { id: string; name: string; coverUrl: string | null }[] }>(
        `/gallery/media/albums`,
        { params: { offset: 0, limit } },
      );
      const items = (Array.isArray(data?.items) ? data.items : []).map((item) => ({
        id: item.id,
        name: item.name,
        coverUrl: item.coverUrl ? resolveMediaUrl(item.coverUrl) : null,
      }));
      return { items };
    } catch {
      return { items: [] };
    }
  },

  // tz: tìm theo ngày ("2026", "tháng 3", "19/11") tính theo giờ địa phương như Thư viện.
  searchGallerySemantic: async (
    query: string,
    signal?: AbortSignal,
    scope?: string | null,
  ): Promise<MediaListItem[]> => {
    try {
      const params: Record<string, string> = { q: query, tz: clientTimeZone() };
      if (scope) params.scope = scope;
      const data = await http.get<Record<string, unknown>[]>(
        `/gallery/media/search`,
        { params, signal },
      );
      const items = Array.isArray(data) ? data : [];
      return items.map(mapMediaItem);
    } catch (error) {
      if ((error as Error)?.name === "AbortError") throw error;
      return [];
    }
  },

  searchGalleryObjects: async (
    query: string,
    signal?: AbortSignal,
    scope?: string | null,
  ): Promise<MediaListItem[]> => {
    try {
      const params: Record<string, string> = { q: query, tz: clientTimeZone() };
      if (scope) params.scope = scope;
      const data = await http.get<Record<string, unknown>[]>(
        `/gallery/media/objects/search`,
        { params, signal },
      );
      const items = Array.isArray(data) ? data : [];
      return items.map(mapMediaItem);
    } catch (error) {
      if ((error as Error)?.name === "AbortError") throw error;
      return [];
    }
  },

  fetchObjectClasses: async (): Promise<{ class_name: string; count: number }[]> => {
    try {
      const data = await http.get<{ class_name: string; count: number }[]>(
        `/gallery/media/objects/classes`,
      );
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },

  fetchMediaDetections: async (mediaId: string): Promise<ObjectDetection[]> => {
    try {
      const data = await http.get<ObjectDetection[]>(
        `/gallery/media/${encodeURIComponent(mediaId)}/detections`,
      );
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },

  /** Công thức chỉnh hiện tại + URL bản display GỐC để editor render. */
  fetchMediaEdit: async (mediaId: string): Promise<MediaEdit> => {
    const data = await http.get<MediaEdit>(`/gallery/media/${encodeURIComponent(mediaId)}/edit`);
    return { ...data, sourceUrl: resolveMediaUrl(data.sourceUrl) };
  },

  /** Lưu chỉnh (không phá huỷ): công thức + ảnh đã render (≤2048px). */
  saveMediaEdit: async (mediaId: string, recipe: EditRecipe, image: Blob): Promise<MediaEdit> => {
    const form = new FormData();
    form.append("recipe", JSON.stringify(recipe));
    form.append("image", image, "edited.webp");
    const data = await http.upload<MediaEdit>(`/gallery/media/${encodeURIComponent(mediaId)}/edit`, form);
    return { ...data, sourceUrl: resolveMediaUrl(data.sourceUrl) };
  },

  /** Về ảnh gốc (xoá công thức + bản đã chỉnh). */
  deleteMediaEdit: (mediaId: string) =>
    http.del<MediaEdit>(`/gallery/media/${encodeURIComponent(mediaId)}/edit`),

  fetchSimilarMedia: async (
    mediaId: string,
    limit = 12,
  ): Promise<SimilarMediaResult> => {
    try {
      const data = await http.get<{
        source?: SimilarMediaResult["source"];
        model?: string | null;
        items?: Record<string, unknown>[];
      }>(`/gallery/media/${encodeURIComponent(mediaId)}/similar`, {
        params: { limit },
      });
      return {
        source: data?.source ?? null,
        model: data?.model ?? null,
        items: (Array.isArray(data?.items) ? data.items : []).map(mapMediaItem),
      };
    } catch {
      return { source: null, model: null, items: [] };
    }
  },

  searchAlbums: async (
    query: string,
    signal?: AbortSignal,
  ): Promise<AlbumSearchResult[]> => {
    try {
      const data = await http.get<
        { id: string; name: string; description: string; coverUrl: string | null; mediaCount: number }[]
      >(`/gallery/media/albums/search`, { params: { q: query }, signal });
      const items = Array.isArray(data) ? data : [];
      return items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description || "",
        coverUrl: item.coverUrl ? resolveMediaUrl(item.coverUrl) : null,
        mediaCount: item.mediaCount,
      }));
    } catch (error) {
      if ((error as Error)?.name === "AbortError") throw error;
      return [];
    }
  },

  fetchTrash: async (
    offset = 0,
    limit = 100,
  ): Promise<Omit<MediaPage, "items"> & { items: TrashItem[] }> => {
    try {
      const data = await http.get<{
        items?: Record<string, unknown>[];
        hasMore?: boolean;
        limit?: number;
        offset?: number;
      }>(`/gallery/media/trash`, { params: { offset, limit } });
      const items = (Array.isArray(data?.items) ? data.items : []).map(
        (item) => ({ ...mapMediaItem(item), deletedAt: item.deletedAt }) as TrashItem,
      );
      return {
        items,
        hasMore: Boolean(data?.hasMore),
        limit: data?.limit ?? limit,
        offset: data?.offset ?? offset,
      };
    } catch {
      return { items: [], hasMore: false, limit, offset };
    }
  },

  // Bulk actions: the backend takes ≤ 100 ids per request (`media.schema.js::mediaIdsSchema`) →
  // "select all" is sent in chunks, one after another.
  setFavorite: (ids: string[], favorite: boolean): Promise<void> =>
    inChunks(ids, (chunk) => http.post<void>("/gallery/media/favorite", { ids: chunk, favorite })),

  moveToTrash: (ids: string[]): Promise<void> =>
    inChunks(ids, (chunk) => http.post<void>("/gallery/media/trash", { ids: chunk })),

  restoreMedia: (ids: string[]): Promise<void> =>
    inChunks(ids, (chunk) => http.post<void>("/gallery/media/restore", { ids: chunk })),

  permanentDeleteMedia: (ids: string[]): Promise<void> =>
    inChunks(ids, (chunk) => http.post<void>("/gallery/media/trash/permanent", { ids: chunk })),

  emptyTrash: async (): Promise<number> => {
    const data = await http.post<{ deleted?: number }>("/gallery/media/trash/empty");
    return data?.deleted ?? 0;
  },

  fetchTagSummary: async (): Promise<TagSummary[]> => {
    const data = await http.get<TagSummary[]>("/gallery/media/tags");
    const items = Array.isArray(data) ? data : [];
    return items.map((row) => ({
      ...row,
      coverUrl: row.coverUrl ? resolveMediaUrl(row.coverUrl) : null,
    }));
  },

  fetchTagCatalog: async (): Promise<TagCatalog> => {
    const data = await http.get<Partial<TagCatalog>>("/gallery/media/tags/catalog");
    return {
      model: data?.model ?? null,
      sections: Array.isArray(data?.sections) ? data.sections : [],
      labels: Array.isArray(data?.labels) ? data.labels : [],
      labelModel: data?.labelModel ?? null,
    };
  },

  fetchMediaTags: async (mediaId: string): Promise<MediaTag[]> => {
    try {
      const data = await http.get<MediaTag[]>(
        `/gallery/media/${encodeURIComponent(mediaId)}/tags`,
      );
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },

  fetchTagMedia: async (
    tag: string,
    { minConfidence, limit = 60, offset = 0 }: { minConfidence: number | null; limit?: number; offset?: number },
  ): Promise<TagMediaPage> => {
    const params: Record<string, string> = {
      limit: String(limit),
      offset: String(offset),
    };
    if (minConfidence !== null) params.minConfidence = String(minConfidence);
    const data = await http.get<{ total?: number; items?: Record<string, unknown>[] }>(
      `/gallery/media/tags/${encodeURIComponent(tag)}/media`,
      { params },
    );
    return {
      total: data?.total ?? 0,
      items: (Array.isArray(data?.items) ? data.items : []).map(mapMediaItem),
    };
  },

  downloadUrl: (fileUrl: string): string => {
    const base =
      typeof window !== "undefined" && window.location?.href
        ? window.location.href
        : "http://localhost/";
    const url = new URL(fileUrl, base);
    url.searchParams.set("download", "1");
    return url.toString();
  },
});
