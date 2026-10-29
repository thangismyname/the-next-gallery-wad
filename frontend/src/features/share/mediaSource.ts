// Dựng TransferSource từ media đã có trên tài khoản — stream file gốc từ backend.
// Dùng chung cho ShareDialog (ảnh chọn từ Gallery) và SendView (chọn từ thư viện).
import { TransferSource } from "@/hooks/useFileTransfer";
import { MediaListItem, resolveMediaUrl } from "@/services/media";

const FALLBACK_MIME: Record<MediaListItem["mediaType"], string> = {
  photo: "image/jpeg",
  video: "video/mp4",
};

const MIME_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

// title = original_filename (thường đã có đuôi) — chỉ thêm đuôi khi thiếu.
function buildFileName(item: MediaListItem, mime: string): string {
  const base = item.title?.trim() || item.id;
  if (/\.[a-z0-9]{2,5}$/i.test(base)) return base;
  const ext =
    MIME_EXTENSION[mime] ?? (item.mediaType === "video" ? "mp4" : "jpg");
  return `${base}.${ext}`;
}

export function buildMediaSource(item: MediaListItem): TransferSource {
  const mime =
    item.mimeType ||
    FALLBACK_MIME[item.mediaType] ||
    "application/octet-stream";
  return {
    id: item.id,
    name: buildFileName(item, mime),
    type: mime,
    size: item.sizeBytes ?? 0,
    stream: async () => {
      // URL đã ký sẵn từ API (stream endpoint không mở công khai theo id).
      const response = await fetch(resolveMediaUrl(item.url), {
        credentials: "include",
      });
      if (!response.ok || !response.body) {
        throw new Error(`Không thể đọc file ${item.id}`);
      }
      return response.body;
    },
  };
}
