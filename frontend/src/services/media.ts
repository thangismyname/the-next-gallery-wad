import { Media } from "@/types";
import { API_URL as BASE_URL, AUTH_BASE_URL } from "@/lib/config";

export interface MediaListItem {
  id: string;
  mediaType: "photo" | "video";
  mimeType?: string | null;
  title: string | null;
  url: string;
  thumbnailUrl: string;
  thumbnailUrlLarge?: string;
  /** Bản xem ≤2048px (chỉ ảnh) — lightbox dùng bản này, file gốc chỉ khi phóng to. */
  displayUrl?: string | null;
  /** Chỉ HEIC: WebP độ phân giải gốc (trình duyệt không hiển thị được file gốc). */
  fullUrl?: string | null;
  width?: number;
  height?: number;
  durationSeconds?: number | null;
  sizeBytes?: number;
  isFavorite: boolean;
  createdAt?: string | null;
  /** Ngày chụp (EXIF / metadata video); null → dùng createdAt. */
  takenAt?: string | null;
  aiTags: string[];
  score?: number | null;
  /** Search kết hợp: điểm từng nguồn (0–1) — CLIP, tag nội dung, vật thể YOLO. */
  scoreParts?: { clip: number; tag?: number; object?: number } | null;
}

export interface TrashItem extends MediaListItem {
  deletedAt: string;
}

export interface MediaPage {
  items: MediaListItem[];
  /** Tổng số media (không chỉ trang này) — chỉ API danh sách Thư viện trả. */
  total?: number;
  hasMore: boolean;
  limit: number;
  offset: number;
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

export function resolveMediaUrl(url?: string): string {
  if (!url) return "";
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("blob:") ||
    url.startsWith("data:")
  ) {
    return url;
  }
  return `${AUTH_BASE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
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
      (item.thumbnailUrl as string | undefined) ||
        (item.url as string | undefined),
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
  } as MediaListItem;
}

// Chuyển MediaListItem → Media (thêm các trường bắt buộc: altText, width/height mặc định).
// Dùng khi đưa item vào components yêu cầu kiểu Media đầy đủ (ImageCard, Lightbox).
export function toMedia(item: MediaListItem): Media {
  return {
    ...item,
    altText: item.title ?? "Gallery photo",
    width: item.width ?? 800,
    height: item.height ?? 600,
  };
}

export type GallerySort = "newest" | "oldest" | "name_asc" | "name_desc";

/** Bộ lọc cho media picker (dialog chọn ảnh). */
export type MediaFilter = "all" | "favorites" | "photos" | "videos";

export const fetchMedia = async (
  offset = 0,
  limit = 40,
  sort?: GallerySort,
): Promise<MediaPage> => {
  try {
    const params = new URLSearchParams({
      offset: String(offset),
      limit: String(limit),
    });
    if (sort) params.set("sort", sort);
    const response = await fetch(
      `${BASE_URL}/gallery/media?${params.toString()}`,
      {
        credentials: "include",
        headers: { Accept: "application/json" },
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const json = await response.json();
    const data = json.data ?? json;

    const items: MediaListItem[] = (
      Array.isArray(data.items) ? data.items : []
    ).map(
      (item: {
        url: string | undefined;
        thumbnailUrl: any;
        thumbnailUrlLarge: string | undefined;
      }) => mapMediaItem(item as Record<string, unknown>),
    );

    return {
      items,
      total: typeof data.total === "number" ? data.total : undefined,
      hasMore: Boolean(data.hasMore),
      limit: data.limit ?? limit,
      offset: data.offset ?? offset,
    };
  } catch (error) {
    console.error("Failed to fetch media from API:", error);
    return {
      items: [],
      hasMore: false,
      limit,
      offset,
    };
  }
};

/** Lấy media của mình theo danh sách id (giữ thứ tự `ids`; id không hợp lệ bị bỏ qua). */
export const fetchMediaByIds = async (
  ids: string[],
): Promise<MediaListItem[]> => {
  if (ids.length === 0) return [];
  const response = await fetch(`${BASE_URL}/gallery/media/lookup`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const json = await response.json();
  const data = json.data ?? json;
  return (Array.isArray(data.items) ? data.items : []).map(
    (item: Record<string, unknown>) => mapMediaItem(item),
  );
};

export const uploadMedia = async (files: File[]): Promise<string[]> => {
  const formData = new FormData();
  files.forEach((file) => formData.append("media", file));

  const response = await fetch(`${BASE_URL}/gallery/media`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const json = await response.json();
  const uploaded = (json.data?.uploaded ?? []) as { id: string }[];
  return uploaded.map((item) => item.id);
};

export const fetchFavorites = async (
  offset = 0,
  limit = 40,
): Promise<MediaPage> => {
  const response = await fetch(
    `${BASE_URL}/gallery/media/favorites?offset=${offset}&limit=${limit}`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const json = await response.json();
  const data = json.data ?? json;

  const items: MediaListItem[] = (
    Array.isArray(data.items) ? data.items : []
  ).map((item: Record<string, unknown>) => mapMediaItem(item));

  return {
    items,
    hasMore: Boolean(data.hasMore),
    limit: data.limit ?? limit,
    offset: data.offset ?? offset,
  };
};

/**
 * Lấy media theo bộ lọc cho picker ảnh: tất cả / yêu thích / ảnh / video.
 * - favorites → dùng endpoint chuyên biệt.
 * - photos/videos → truyền type filter, phân trang sạch ở server.
 */
export const fetchMediaByFilter = async (
  filter: MediaFilter,
  offset = 0,
  limit = 100,
): Promise<MediaPage> => {
  const response = await fetch(
    filter === "favorites"
      ? `${BASE_URL}/gallery/media/favorites?offset=${offset}&limit=${limit}`
      : `${BASE_URL}/gallery/media?${new URLSearchParams({
          offset: String(offset),
          limit: String(limit),
          ...(filter === "photos" || filter === "videos"
            ? { type: filter === "photos" ? "photo" : "video" }
            : {}),
        }).toString()}`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const json = await response.json();
  const data = json.data ?? json;

  const items: MediaListItem[] = (
    Array.isArray(data.items) ? data.items : []
  ).map((item: Record<string, unknown>) => mapMediaItem(item));

  return {
    items,
    hasMore: Boolean(data.hasMore),
    limit: data.limit ?? limit,
    offset: data.offset ?? offset,
  };
};

export const fetchAlbumCovers = async (
  limit = 20,
): Promise<{ items: AlbumCover[] }> => {
  try {
    const response = await fetch(
      `${BASE_URL}/gallery/media/albums?offset=0&limit=${limit}`,
      {
        credentials: "include",
        headers: { Accept: "application/json" },
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const json = await response.json();
    const data = json.data ?? json;

    const items: AlbumCover[] = (
      Array.isArray(data.items) ? data.items : []
    ).map((item: { id: string; name: string; coverUrl: string | null }) => ({
      id: item.id,
      name: item.name,
      coverUrl: item.coverUrl ? resolveMediaUrl(item.coverUrl) : null,
    }));

    return { items };
  } catch (error) {
    console.error("Failed to fetch album covers from API:", error);
    return { items: [] };
  }
};

export const searchGallerySemantic = async (
  query: string,
  signal?: AbortSignal,
  /** Phạm vi Spotlight: favorites | label:<id> | album:<id> (q được để trống). */
  scope?: string | null,
): Promise<MediaListItem[]> => {
  try {
    const params = new URLSearchParams({ q: query });
    if (scope) params.set("scope", scope);
    const response = await fetch(
      `${BASE_URL}/gallery/media/search?${params}`,
      { signal, credentials: "include" },
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    const items: MediaListItem[] = (
      Array.isArray(data.data) ? data.data : []
    ).map((item: Record<string, unknown>) => mapMediaItem(item));
    return items;
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw error;
    }
    console.error("Failed to search gallery:", error);
    return [];
  }
};

export interface ObjectDetection {
  class_name: string;
  confidence: number;
  bbox: number[];
  model: string;
}

export interface ObjectClass {
  class_name: string;
  count: number;
}

export interface DetectionStats {
  total: number;
  detected: number;
  pending: number;
}

/** Tìm ảnh theo ĐỐI TƯỢNG (YOLO26 — class COCO) cho Spotlight. */
export const searchGalleryObjects = async (
  query: string,
  signal?: AbortSignal,
  /** Phạm vi Spotlight: favorites | label:<id> | album:<id>. */
  scope?: string | null,
): Promise<MediaListItem[]> => {
  try {
    const params = new URLSearchParams({ q: query });
    if (scope) params.set("scope", scope);
    const response = await fetch(
      `${BASE_URL}/gallery/media/objects/search?${params}`,
      { signal, credentials: "include" },
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return (Array.isArray(data.data) ? data.data : []).map(
      (item: Record<string, unknown>) => mapMediaItem(item),
    );
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw error;
    }
    console.error("Failed to search objects:", error);
    return [];
  }
};

/** Danh sách class đã phát hiện (kèm số ảnh) — gợi ý cho ô search. */
export const fetchObjectClasses = async (): Promise<
  { class_name: string; count: number }[]
> => {
  try {
    const response = await fetch(`${BASE_URL}/gallery/media/objects/classes`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const json = await response.json();
    return Array.isArray(json.data) ? json.data : [];
  } catch (error) {
    console.error("Failed to fetch object classes:", error);
    return [];
  }
};

/** Detection (kèm bbox) của 1 ảnh — dùng cho Developer Mode overlay. */
export const fetchMediaDetections = async (
  mediaId: string,
): Promise<ObjectDetection[]> => {
  try {
    const response = await fetch(
      `${BASE_URL}/gallery/media/${mediaId}/detections`,
      {
        credentials: "include",
        headers: { Accept: "application/json" },
      },
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const json = await response.json();
    return Array.isArray(json.data) ? json.data : [];
  } catch (error) {
    console.error("Failed to fetch media detections:", error);
    return [];
  }
};

export interface SimilarMediaResult {
  /** Nguồn vector: DINOv3, fallback CLIP image↔image, hoặc null khi chưa có. */
  source: "dinov3" | "clip" | null;
  model: string | null;
  items: MediaListItem[];
}

/** Ảnh tương tự của 1 ảnh (DINOv3) — dùng cho Lightbox. `score` = cosine. */
export const fetchSimilarMedia = async (
  mediaId: string,
  limit = 12,
): Promise<SimilarMediaResult> => {
  try {
    const response = await fetch(
      `${BASE_URL}/gallery/media/${mediaId}/similar?limit=${limit}`,
      {
        credentials: "include",
        headers: { Accept: "application/json" },
      },
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const json = await response.json();
    const data = json.data ?? {};
    return {
      source: data.source ?? null,
      model: data.model ?? null,
      items: (Array.isArray(data.items) ? data.items : []).map(
        (item: Record<string, unknown>) => mapMediaItem(item),
      ),
    };
  } catch (error) {
    console.error("Failed to fetch similar media:", error);
    return { source: null, model: null, items: [] };
  }
};

export const searchAlbums = async (
  query: string,
  signal?: AbortSignal,
): Promise<AlbumSearchResult[]> => {
  try {
    const response = await fetch(
      `${BASE_URL}/gallery/media/albums/search?q=${encodeURIComponent(query)}`,
      { signal, credentials: "include" },
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    const items: AlbumSearchResult[] = (
      Array.isArray(data.data) ? data.data : []
    ).map(
      (item: {
        id: string;
        name: string;
        description: string;
        coverUrl: string | null;
        mediaCount: number;
      }) => ({
        id: item.id,
        name: item.name,
        description: item.description || "",
        coverUrl: item.coverUrl ? resolveMediaUrl(item.coverUrl) : null,
        mediaCount: item.mediaCount,
      }),
    );
    return items;
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw error;
    }
    console.error("Failed to search albums:", error);
    return [];
  }
};

// ================= THÙNG RÁC =================

export const trashQueryKey = ["trash", "media"] as const;

export const fetchTrash = async (
  offset = 0,
  limit = 100,
): Promise<Omit<MediaPage, "items"> & { items: TrashItem[] }> => {
  try {
    const response = await fetch(
      `${BASE_URL}/gallery/media/trash?offset=${offset}&limit=${limit}`,
      {
        credentials: "include",
        headers: { Accept: "application/json" },
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const json = await response.json();
    const data = json.data ?? json;

    const items: TrashItem[] = (
      Array.isArray(data.items) ? data.items : []
    ).map(
      (item: Record<string, unknown>) =>
        ({ ...mapMediaItem(item), deletedAt: item.deletedAt }) as TrashItem,
    );

    return {
      items,
      hasMore: Boolean(data.hasMore),
      limit: data.limit ?? limit,
      offset: data.offset ?? offset,
    };
  } catch (error) {
    console.error("Failed to fetch trash from API:", error);
    return { items: [], hasMore: false, limit, offset };
  }
};

export const setFavorite = async (
  ids: string[],
  favorite: boolean,
): Promise<void> => {
  const response = await fetch(`${BASE_URL}/gallery/media/favorite`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, favorite }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
};

export const moveToTrash = async (ids: string[]): Promise<void> => {
  const response = await fetch(`${BASE_URL}/gallery/media/trash`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
};

export const restoreMedia = async (ids: string[]): Promise<void> => {
  const response = await fetch(`${BASE_URL}/gallery/media/restore`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
};

export const permanentDeleteMedia = async (ids: string[]): Promise<void> => {
  const response = await fetch(`${BASE_URL}/gallery/media/trash/permanent`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
};
/** Dọn sạch thùng rác (xoá vĩnh viễn mọi mục). Trả về số mục đã xoá. */
export const emptyTrash = async (): Promise<number> => {
  const response = await fetch(`${BASE_URL}/gallery/media/trash/empty`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const json = await response.json();
  return json.data?.deleted ?? 0;
};

// ============ Gắn tag nội dung (AI Studio — phân loại) ============

export interface TagSummary {
  tag: string;
  /** Số ảnh có confidence ≥ ngưỡng của tag. */
  count: number;
  threshold: number;
  coverUrl: string | null;
  topConfidence: number;
}

export interface TagMediaPage {
  items: MediaListItem[];
  total: number;
}

export const tagSummaryQueryKey = ["ai", "tags", "summary"] as const;
export const tagMediaQueryKey = (tag: string, minConfidence: number | null) =>
  ["ai", "tags", "media", tag, minConfidence] as const;

/** Tổng quan theo tag (số ảnh + ảnh bìa) cho lưới danh mục. */
export const fetchTagSummary = async (): Promise<TagSummary[]> => {
  const response = await fetch(`${BASE_URL}/gallery/media/tags`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const json = await response.json();
  return (json.data ?? []).map((row: TagSummary) => ({
    ...row,
    coverUrl: row.coverUrl ? resolveMediaUrl(row.coverUrl) : null,
  }));
};

/**
 * Ảnh của 1 tag theo confidence giảm dần (`score` = confidence).
 * `minConfidence` null → dùng ngưỡng riêng của tag.
 */
export const fetchTagMedia = async (
  tag: string,
  {
    minConfidence,
    limit = 60,
    offset = 0,
  }: { minConfidence: number | null; limit?: number; offset?: number },
): Promise<TagMediaPage> => {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (minConfidence !== null)
    params.set("minConfidence", String(minConfidence));
  const response = await fetch(
    `${BASE_URL}/gallery/media/tags/${encodeURIComponent(tag)}/media?${params}`,
    { credentials: "include", headers: { Accept: "application/json" } },
  );
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const json = await response.json();
  const data = json.data ?? {};
  return {
    total: data.total ?? 0,
    items: (Array.isArray(data.items) ? data.items : []).map(
      (item: Record<string, unknown>) => mapMediaItem(item),
    ),
  };
};

/** URL tải về (Content-Disposition: attachment + tên file gốc) từ URL file đã ký. */
export function downloadUrl(fileUrl: string): string {
  const url = new URL(fileUrl, window.location.href);
  url.searchParams.set("download", "1");
  return url.toString();
}

/**
 * Tải bản gốc: 1 ảnh → file gốc; nhiều ảnh → 1 file .zip do server nén.
 * Dùng <a> / <form> điều hướng (trình duyệt tự lưu file đang stream, không qua
 * RAM của tab). Đích là iframe ẩn để lỗi (401 / 429) không làm rời trang.
 */
export function downloadMedia(ids: string[]) {
  if (ids.length === 0) return;
  const target = "tng-download";
  if (!document.querySelector(`iframe[name="${target}"]`)) {
    const frame = document.createElement("iframe");
    frame.name = target;
    frame.hidden = true;
    document.body.appendChild(frame);
  }
  if (ids.length === 1) {
    const a = document.createElement("a");
    // Không có chữ ký → backend kiểm tra cookie chủ ảnh.
    a.href = `${BASE_URL}/gallery/media/${ids[0]}/file?download=1`;
    a.target = target;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  const form = document.createElement("form");
  form.method = "POST";
  form.action = `${BASE_URL}/gallery/media/download/zip`;
  form.target = target;
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "ids";
  input.value = ids.join(",");
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
  form.remove();
}
