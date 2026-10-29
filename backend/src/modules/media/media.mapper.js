// Cột dùng chung cho mọi truy vấn danh sách media — 1 nơi duy nhất để bảo trì.
export const MEDIA_COLUMNS = `
      id,
      media_type,
      mime_type,
      COALESCE(original_filename, CONCAT('Media ', id::text)) AS title,
      width,
      height,
      duration_seconds,
      file_size_kb,
      thumbnail_small_object,
      thumbnail_object,
      is_favorite,
      created_at,
      deleted_at,
      taken_at,
      -- 2 tag nội dung tin cậy nhất (đạt ngưỡng) — hiện trên ô ảnh. \`id\` ở
      -- đây là cột của bảng media bên ngoài (media_tags không có cột id).
      (SELECT array_agg(x.tag ORDER BY x.confidence DESC)
         FROM (SELECT t.tag, t.confidence FROM media_tags t
                WHERE t.media_id = id AND t.confidence >= t.threshold
                ORDER BY t.confidence DESC LIMIT 2) x) AS ai_tags`;

// Whitelist các kiểu sắp xếp → ORDER BY an toàn (không cho dính SQL injection).
// Mới / cũ theo NGÀY CHỤP (EXIF), thiếu thì ngày tải lên.
export const MEDIA_SORT_CLAUSES = {
  newest: "COALESCE(taken_at, created_at) DESC, created_at DESC",
  oldest: "COALESCE(taken_at, created_at) ASC, created_at ASC",
  name_asc: "COALESCE(original_filename, '') ASC, created_at DESC",
  name_desc: "COALESCE(original_filename, '') DESC, created_at DESC",
};

import { signParams } from "./media.urls.js";

// Tăng khi đổi pipeline thumbnail — thumbnail trả `immutable`, nên chỉ đổi
// URL mới buộc trình duyệt bỏ bản đã cache. v2: ảnh luôn trả bản resize (trước
// đây ảnh thiếu thumbnail bị trả cả file gốc dưới URL thumbnail).
const THUMB_VERSION = 2;

/**
 * URL thumbnail của 1 media (đã ký — media.urls.js): size = small (200) |
 * med (400) | display (≤2048) | full (HEIC). `scope` = id link công khai.
 */
export function mediaThumbUrl(mediaId, size, scope = "") {
  return `/api/gallery/media/${mediaId}/thumbnail?size=${size}&v=${THUMB_VERSION}&${signParams(mediaId, size, scope)}`;
}

/** URL file gốc (đã ký). */
export function mediaFileUrl(mediaId, scope = "") {
  return `/api/gallery/media/${mediaId}/file?${signParams(mediaId, "file", scope)}`;
}

/** Bộ URL của 1 media — dùng lại khi cần ký lại cho link công khai. */
export function mediaUrls(mediaId, { heif = false, scope = "" } = {}) {
  return {
    url: mediaFileUrl(mediaId, scope),
    // Ảnh + video (poster): endpoint tự tạo bản còn thiếu.
    thumbnailUrl: mediaThumbUrl(mediaId, "small", scope),
    thumbnailUrlLarge: mediaThumbUrl(mediaId, "med", scope),
    // Ảnh: bản xem lightbox (≤2048px); video: poster.
    displayUrl: mediaThumbUrl(mediaId, "display", scope),
    // Bản xem độ phân giải gốc khi trình duyệt không hiển thị được file gốc
    // (HEIC). null → lightbox dùng thẳng `url`.
    fullUrl: heif ? mediaThumbUrl(mediaId, "full", scope) : null,
  };
}

const HEIF_MIMES = new Set(["image/heic", "image/heif"]);

export function toMediaItem(item) {
  const mediaId = String(item.id);
  const isPhoto = item.media_type === "photo";
  return {
    id: mediaId,
    mediaType: item.media_type,
    mimeType: item.mime_type ?? null,
    title: item.title,
    ...mediaUrls(mediaId, {
      heif: isPhoto && HEIF_MIMES.has(String(item.mime_type || "").toLowerCase()),
    }),
    width: item.width || 800,
    height: item.height || 600,
    // NUMERIC → pg trả chuỗi ("5.000") — ép về số cho FE.
    durationSeconds:
      item.duration_seconds != null ? Number(item.duration_seconds) : null,
    sizeBytes: item.file_size_kb ? Number(item.file_size_kb) * 1024 : 0,
    isFavorite: Boolean(item.is_favorite),
    createdAt: item.created_at ?? null,
    // Ngày chụp (EXIF / metadata video); null = không có → FE dùng createdAt.
    takenAt: item.taken_at ?? null,
    deletedAt: item.deleted_at || null,
    aiTags: item.ai_tags ?? [],
    score: item.score ?? null,
  };
}
