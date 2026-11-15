import { type MediaListItem } from "@tng/shared";
// File trong danh sách gửi: chọn từ máy (local) hoặc ảnh / video đã có trên
// tài khoản (library — server copy / stream, không cần P2P).

export type SendEntry =
  | { kind: "local"; id: string; file: File; previewUrl?: string }
  | { kind: "library"; id: string; item: MediaListItem };

let localIdCounter = 0;

/** File chọn từ máy → entry (id duy nhất trong phiên). */
export function localEntry(file: File): Extract<SendEntry, { kind: "local" }> {
  return { kind: "local", id: `local-${++localIdCounter}`, file };
}

export const libraryEntry = (item: MediaListItem): SendEntry => ({ kind: "library", id: item.id, item });

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
