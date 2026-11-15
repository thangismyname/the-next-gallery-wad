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
  metadata?: MediaMetadata;
}

export interface UploadProgress {
  uploadedCount: number; // số file đã upload xong (đầu batch hiện tại)
  totalCount: number; // tổng số file
  currentBatchPercent: number; // % của batch đang chạy (dùng XHR progress)
}

