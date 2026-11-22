/**
 * Lọc file ảnh / video từ một thư mục hoặc một lần kéo thả — cùng quy tắc với backend
 * `media.sources.js::classifyUpload` (MIME, fallback theo đuôi cho HEIC / MOV…). File khác
 * (`.json` của Google Takeout, `.DS_Store`…) bị bỏ qua thay vì làm hỏng cả lô upload.
 */
const PHOTO_MIMES = new Set([
  "image/jpeg", "image/jpg", "image/pjpeg", "image/png", "image/webp",
  "image/gif", "image/avif", "image/tiff", "image/bmp", "image/heic", "image/heif",
]);
const EXT_ONLY = new Set([".heic", ".heif", ".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".3gp", ".mts", ".m2ts"]);

export function isMediaFile(file: { name: string; type: string }): boolean {
  const type = file.type.toLowerCase();
  if (PHOTO_MIMES.has(type) || type.startsWith("video/")) return true;
  const dot = file.name.lastIndexOf(".");
  return dot > 0 && EXT_ONLY.has(file.name.slice(dot).toLowerCase());
}

/** Mọi file trong một lần thả (kể cả thư mục lồng nhau — webkitGetAsEntry). */
export async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  return (await entriesFromDrop(dt)).map((e) => e.file);
}

/** Như `filesFromDrop` nhưng giữ đường dẫn tương đối ("Takeout/Google Photos/…/a.jpg"). */
export async function entriesFromDrop(dt: DataTransfer): Promise<{ path: string; file: File }[]> {
  const entries = Array.from(dt.items)
    .map((item) => item.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => Boolean(e));
  // Trình duyệt không có webkitGetAsEntry → chỉ lấy file ở cấp đầu.
  if (entries.length === 0) return Array.from(dt.files).map((file) => ({ path: file.name, file }));
  const out: { path: string; file: File }[] = [];
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((ok, fail) => (entry as FileSystemFileEntry).file(ok, fail));
      out.push({ path: entry.fullPath.replace(/^\//, ""), file });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries trả từng đợt (~100) — đọc đến khi rỗng.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((ok, fail) => reader.readEntries(ok, fail));
        if (batch.length === 0) break;
        for (const child of batch) await walk(child);
      }
    }
  };
  for (const entry of entries) await walk(entry);
  return out;
}

/** Có file trong lần kéo không (bỏ qua kéo chữ / ảnh trong trang). */
export const isFileDrag = (e: { dataTransfer: DataTransfer | null }) =>
  Boolean(e.dataTransfer?.types.includes("Files"));
