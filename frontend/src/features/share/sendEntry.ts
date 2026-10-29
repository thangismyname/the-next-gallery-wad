// File trong danh sách gửi của SendView (/share): chọn từ máy (local) hoặc
// ảnh / video đã có trên tài khoản (library). Hàm thuần đọc thông tin hiển thị
// + dựng TransferSource để gửi qua WebRTC.
import type { TransferSource } from "@/hooks/useFileTransfer";
import type { MediaListItem } from "@/services/media";
import { buildMediaSource } from "./mediaSource";

export type SendEntry =
  | { kind: "local"; id: string; file: File; previewUrl?: string }
  | { kind: "library"; id: string; item: MediaListItem };

let localIdCounter = 0;

/** File chọn từ máy → entry (id duy nhất trong phiên). */
export function localEntry(file: File): Extract<SendEntry, { kind: "local" }> {
  return { kind: "local", id: `local-${++localIdCounter}`, file };
}

/** Local: stream thẳng File (đúng dung lượng → tiến độ chính xác); library: tải từ backend. */
export function buildSource(entry: SendEntry): TransferSource {
  if (entry.kind === "library") return buildMediaSource(entry.item);
  return {
    id: entry.id,
    name: entry.file.name,
    type: entry.file.type || "application/octet-stream",
    size: entry.file.size,
    stream: () => entry.file.stream(),
  };
}

export const entryName = (entry: SendEntry): string =>
  entry.kind === "local" ? entry.file.name : (entry.item.title ?? entry.item.id);

export const entrySize = (entry: SendEntry): number =>
  entry.kind === "local" ? entry.file.size : (entry.item.sizeBytes ?? 0);

export const entryPreview = (entry: SendEntry): string | undefined =>
  entry.kind === "local" ? entry.previewUrl : entry.item.thumbnailUrl;

export const entryIsVideo = (entry: SendEntry): boolean =>
  entry.kind === "local"
    ? entry.file.type.startsWith("video/")
    : entry.item.mediaType === "video";
