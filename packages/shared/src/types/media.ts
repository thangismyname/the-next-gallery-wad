export interface MediaMetadata {
  camera?: string;
  focalLength?: string;
  iso?: number;
  aperture?: string;
  takenAt?: string;
}

export interface Media {
  altText: string;
  id: string;
  title: string | null;
  url: string;
  thumbnailUrl: string;
  thumbnailUrlLarge?: string;
  /** Bản xem ≤2048px (chỉ ảnh) — lightbox dùng bản này, file gốc chỉ khi phóng to. */
  displayUrl?: string | null;
  /** Chỉ HEIC: WebP độ phân giải gốc (trình duyệt không hiển thị được file gốc). */
  fullUrl?: string | null;
  width: number;
  height: number;
  mediaType: "photo" | "video";
  durationSeconds?: number | null;
  sizeBytes?: number;
  isFavorite?: boolean;
  createdAt?: string | null;
  /** Ngày chụp (EXIF / metadata video); null → dùng createdAt. */
  takenAt?: string | null;
  /** Id tag nội dung tin cậy nhất (AI Studio) — tên hiển thị: studio.tags.<id>. */
  aiTags: string[];
  /** Lần chỉnh gần nhất (basic edit); null = ảnh gốc. */
  editedAt?: string | null;
  /** Description (Google Takeout import…). */
  caption?: string | null;
  /** Where it was taken (WGS84). */
  location?: { lat: number; lng: number } | null;
  /** Live Photo video (signed URL). */
  motionUrl?: string | null;
  metadata?: MediaMetadata;
}

/**
 * Per-file upload metadata (importers, e.g. Google Takeout) — backend `media.schema.js::parseUploadMeta`.
 * `takenAt` (ISO 8601) only fills in when the file has no EXIF / video creation_time.
 */
export interface UploadMeta {
  takenAt?: string;
  favorite?: boolean;
  /** Own manual albums to add the photo to (others are ignored by the backend). */
  albumIds?: string[];
  /** Importer upload: AI runs on the slow lane; a duplicate that is in the Trash stays there. */
  bulk?: boolean;
  /** Import session (`/api/imports`) this upload belongs to — counted in its report. */
  importId?: string;
  /** → media.caption (only when empty). */
  description?: string;
  /** Where it was taken (only when unknown). */
  location?: { lat: number; lng: number };
  /** This file is the Live Photo video of file #n in the SAME request (n comes first). */
  livePhotoOf?: number;
}

export interface UploadProgress {
  uploadedCount: number; // số file đã upload xong (đầu batch hiện tại)
  totalCount: number; // tổng số file
  currentBatchPercent: number; // % của batch đang chạy (dùng XHR progress)
}

