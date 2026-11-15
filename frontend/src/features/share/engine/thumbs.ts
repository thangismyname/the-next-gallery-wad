import { resolveMediaUrl, type MediaListItem } from "@tng/shared";
// Thumbnail nhỏ (≤ 160 px WebP, vài KB) gửi kèm danh sách file — người nhận
// thấy ảnh xem trước trước khi tải. Được mã hoá bằng khoá phiên trước khi lên server.

const MAX_SIDE = 160;
const TIMEOUT_MS = 8000;

async function canvasToWebp(source: CanvasImageSource, width: number, height: number) {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.7));
  return blob ? blob.arrayBuffer() : null;
}

function videoFrame(file: File): Promise<ArrayBuffer | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const done = (value: ArrayBuffer | null) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => done(null), TIMEOUT_MS);
    video.muted = true;
    video.preload = "metadata";
    video.onloadeddata = () => {
      video.currentTime = Math.min(1, (video.duration || 0) / 2);
    };
    video.onseeked = () => {
      void canvasToWebp(video, video.videoWidth, video.videoHeight).then(done, () => done(null));
    };
    video.onerror = () => done(null);
    video.src = url;
  });
}

/** Thumbnail cho file trên máy. null = không tạo được (định dạng lạ, HEIC trên Chrome…). */
export async function thumbFromFile(file: File): Promise<ArrayBuffer | null> {
  try {
    if (file.type.startsWith("video/")) return await videoFrame(file);
    if (!file.type.startsWith("image/")) return null;
    const bitmap = await createImageBitmap(file);
    try {
      return await canvasToWebp(bitmap, bitmap.width, bitmap.height);
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}

/** Ảnh thư viện: thu nhỏ thumbnail server đã tạo (không tải file gốc). */
export async function thumbFromLibrary(item: MediaListItem): Promise<ArrayBuffer | null> {
  const url = item.thumbnailUrl;
  if (!url) return null;
  try {
    const response = await fetch(resolveMediaUrl(url), { credentials: "include" });
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob());
    try {
      return await canvasToWebp(bitmap, bitmap.width, bitmap.height);
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}
