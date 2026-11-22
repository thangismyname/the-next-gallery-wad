import type { ImportSource } from "@tng/shared";

/**
 * Nguồn = các file đã có trên máy (thư mục đã giải nén qua `webkitdirectory`, hoặc kéo thả thư mục).
 * `path` = đường dẫn tương đối (webkitRelativePath / fullPath của lần thả).
 */
export function fileSource(entries: { path: string; file: File }[]): ImportSource<File> {
  const byPath = new Map(entries.map((e) => [e.path, e.file]));
  const get = (path: string) => {
    const file = byPath.get(path);
    if (!file) throw new Error(`missing ${path}`);
    return file;
  };
  return {
    list: async (onCount) => {
      onCount(entries.length);
      return entries.map((e) => ({ path: e.path, size: e.file.size }));
    },
    readText: async (path) => get(path).text(),
    // File của trình duyệt đọc lười khi gửi — không tốn RAM.
    prepare: async (path) => get(path),
  };
}

/** Từ `<input webkitdirectory>`: mỗi File mang webkitRelativePath. */
export const fromDirectoryInput = (files: File[]) =>
  files.map((file) => ({ path: file.webkitRelativePath || file.name, file }));
