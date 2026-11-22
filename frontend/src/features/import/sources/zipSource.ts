import { BlobReader, BlobWriter, TextWriter, ZipReader, type FileEntry } from "@zip.js/zip.js";
import { isTakeoutVideo, type ImportSource } from "@tng/shared";

const MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
  heic: "image/heic", heif: "image/heif", avif: "image/avif", tif: "image/tiff", tiff: "image/tiff", bmp: "image/bmp",
  mp4: "video/mp4", mov: "video/quicktime", m4v: "video/x-m4v", webm: "video/webm", "3gp": "video/3gpp",
};
const mimeOf = (name: string) => {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  return MIME[ext] ?? (isTakeoutVideo(name) ? "video/mp4" : "application/octet-stream");
};

/**
 * Nguồn = các file .zip của Takeout, KHÔNG giải nén cả file: zip.js đọc mục lục (central directory)
 * rồi giải nén từng file khi cần (`prepare` ngay trước khi gửi → chỉ vài file trong RAM cùng lúc).
 * Takeout chia nhiều zip nhưng đường dẫn bên trong thống nhất ("Takeout/Google Photos/…").
 */
export function zipSource(zips: File[]): ImportSource<File> {
  const readers: ZipReader<Blob>[] = [];
  const entries = new Map<string, FileEntry>();
  const get = (path: string) => {
    const entry = entries.get(path);
    if (!entry) throw new Error(`missing ${path}`);
    return entry;
  };
  return {
    list: async (onCount) => {
      for (const zip of zips) {
        const reader = new ZipReader(new BlobReader(zip));
        readers.push(reader);
        for (const entry of await reader.getEntries()) {
          if (!entry.directory && !entries.has(entry.filename)) entries.set(entry.filename, entry);
        }
        onCount(entries.size);
      }
      return [...entries.values()].map((e) => ({ path: e.filename, size: e.uncompressedSize }));
    },
    readText: (path) => get(path).getData(new TextWriter()),
    prepare: async (path) => {
      const name = path.slice(path.lastIndexOf("/") + 1);
      const type = mimeOf(name);
      const entry = get(path);
      const blob = await entry.getData(new BlobWriter(type));
      // Ngày sửa lấy từ zip (không phải "bây giờ") → fingerprint upload chia nhỏ ổn định giữa các lần thử.
      return new File([blob], name, { type, lastModified: entry.lastModDate.getTime() });
    },
    close: () => {
      for (const reader of readers) void reader.close();
    },
  };
}
