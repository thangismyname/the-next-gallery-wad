// Xử lý ảnh / video của Camera — hàm thuần + DOM (canvas, MediaRecorder), không React.
import { RATIO_MAP, VIDEO_MIMES, type AspectRatio, type FacingMode } from "@tng/shared";

/** 75 → "1:15". */
export const formatTimer = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, "0");
  return `${m}:${sec}`;
};

/** MIME video đầu tiên trình duyệt quay được (VIDEO_MIMES theo thứ tự ưu tiên). */
export const pickMime = () => {
  if (typeof MediaRecorder === "undefined") return undefined;
  return VIDEO_MIMES.find((m) => {
    try {
      return MediaRecorder.isTypeSupported(m);
    } catch {
      return false;
    }
  });
};

/** Mở camera (kèm mic để quay video; mic bị từ chối → chỉ hình). Full HD nếu có. */
export const startStream = async (facing: FacingMode) => {
  const video = { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } };
  try {
    return await navigator.mediaDevices.getUserMedia({ video, audio: true });
  } catch {
    return navigator.mediaDevices.getUserMedia({ video });
  }
};

/** Kích thước khung crop hiển thị trong viewfinder, giữ tỉ lệ, không vượt quá box. */
export function fitCropBox(vw: number, vh: number, ratio: number | null): { w: number; h: number } {
  if (!ratio) return { w: vw, h: vh };
  const boxRatio = vw / vh;
  if (boxRatio > ratio) {
    return { w: Math.round(vh * ratio), h: vh };
  }
  return { w: vw, h: Math.round(vw / ratio) };
}

/** Vùng cắt giữa (center crop) của khung `srcW × srcH` theo tỉ lệ `target` (null = cả khung). */
export function centerCrop(srcW: number, srcH: number, target: number | null) {
  let sw = srcW;
  let sh = srcH;
  let sx = 0;
  let sy = 0;
  if (target) {
    if (srcW / srcH > target) {
      sw = Math.round(srcH * target);
      sx = Math.round((srcW - sw) / 2);
    } else {
      sh = Math.round(srcW / target);
      sy = Math.round((srcH - sh) / 2);
    }
  }
  return { sx, sy, sw, sh };
}

/** Canvas mới bị crop theo tỉ lệ (center crop). Trả về canvas gốc nếu ratio "free". */
export function applyAspectCrop(canvas: HTMLCanvasElement, ratio: AspectRatio): HTMLCanvasElement {
  const target = RATIO_MAP[ratio];
  if (!target) return canvas;
  const { sx, sy, sw, sh } = centerCrop(canvas.width, canvas.height, target);
  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;
  const ctx = out.getContext("2d");
  if (!ctx) return canvas;
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return out;
}

/** Vẽ frame từ video lên canvas, lật gương tuỳ chọn. */
export function drawCameraFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  opts: { mirror: boolean; width: number; height: number },
) {
  ctx.save();
  if (opts.mirror) {
    ctx.translate(opts.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, opts.width, opts.height);
  ctx.restore();
}

/** Chụp 1 frame video → JPEG đã lật gương + crop tỉ lệ. */
export function captureFrame(
  video: HTMLVideoElement,
  opts: { mirror: boolean; ratio: AspectRatio },
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  drawCameraFrame(ctx, video, { mirror: opts.mirror, width: canvas.width, height: canvas.height });
  const cropped = applyAspectCrop(canvas, opts.ratio);
  return new Promise((resolve) => cropped.toBlob(resolve, "image/jpeg", 0.92));
}

export type RecordPipeline = { stream: MediaStream; stop: () => void };

/**
 * Quay video có lật gương / crop tỉ lệ: MediaRecorder không làm được → vẽ từng
 * frame lên canvas (requestAnimationFrame) rồi quay `canvas.captureStream(30)`
 * (+ track âm thanh của camera). Không cần (không lật, tỉ lệ "free") hoặc trình
 * duyệt không hỗ trợ → null (quay thẳng stream camera). `stop()` dừng vẽ và
 * dừng mọi track của stream canvas.
 */
export function createRecordPipeline(
  source: MediaStream,
  video: HTMLVideoElement | null,
  opts: { mirror: boolean; ratio: AspectRatio },
): RecordPipeline | null {
  if (!video || video.videoWidth <= 0 || !(opts.mirror || opts.ratio !== "free")) return null;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const { sx, sy, sw, sh } = centerCrop(vw, vh, RATIO_MAP[opts.ratio]);

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx || !("captureStream" in canvas)) return null;
  const full = document.createElement("canvas");
  full.width = vw;
  full.height = vh;
  const fullCtx = full.getContext("2d");
  if (!fullCtx) return null;

  let raf: number | null = null;
  const draw = () => {
    drawCameraFrame(fullCtx, video, { mirror: opts.mirror, width: vw, height: vh });
    ctx.clearRect(0, 0, sw, sh);
    ctx.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
    raf = requestAnimationFrame(draw);
  };
  draw();
  const stream = canvas.captureStream(30);
  source.getAudioTracks().forEach((t) => stream.addTrack(t));
  return {
    stream,
    stop: () => {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      stream.getTracks().forEach((track) => track.stop());
    },
  };
}

// ── Zoom / đèn phần cứng (Chrome Android; Safari / desktop thường không có) ──

export type ZoomRange = { min: number; max: number; step: number };
export type TrackCaps = { zoom: ZoomRange | null; torch: boolean };

// lib.dom chưa khai báo `zoom` / `torch` (Image Capture spec).
type ExtCaps = MediaTrackCapabilities & {
  zoom?: { min?: number; max?: number; step?: number };
  torch?: boolean;
};

/** Track camera hỗ trợ zoom / torch không (range zoom vô nghĩa → null). */
export function readTrackCaps(track: MediaStreamTrack | undefined): TrackCaps {
  const caps = (track?.getCapabilities?.() ?? {}) as ExtCaps;
  const z = caps.zoom;
  const zoom =
    z && typeof z.min === "number" && typeof z.max === "number" && z.max > z.min
      ? { min: z.min, max: z.max, step: z.step && z.step > 0 ? z.step : 0.1 }
      : null;
  return { zoom, torch: caps.torch === true };
}

/** Kẹp vào [min, max] và làm tròn theo step (tránh gọi applyConstraints với số lẻ vô hạn). */
export function clampZoom(value: number, range: ZoomRange): number {
  const v = Math.min(range.max, Math.max(range.min, value));
  const stepped = range.min + Math.round((v - range.min) / range.step) * range.step;
  return Math.round(Math.min(range.max, stepped) * 100) / 100;
}

/** Các mức chip nhanh trong range: luôn có mức nhỏ nhất, rồi 1× · 2× · 5× · 10× nếu đạt được. */
export function zoomPresets(range: ZoomRange): number[] {
  const out = [range.min];
  for (const p of [1, 2, 5, 10]) if (p > range.min + 1e-6 && p <= range.max + 1e-6) out.push(p);
  return out;
}

/** "1×" · "1.5×" · "0.5×" (1 chữ số thập phân, bỏ ".0"). */
export const formatZoom = (z: number) => `${Number(z.toFixed(1))}×`;

/** Áp zoom / torch lên track; trình duyệt từ chối → bỏ qua (UI vẫn dùng được). */
export async function applyTrackSettings(
  track: MediaStreamTrack | undefined,
  settings: { zoom?: number; torch?: boolean },
): Promise<void> {
  if (!track) return;
  try {
    await track.applyConstraints({ advanced: [settings as MediaTrackConstraintSet] });
  } catch {
    /* không hỗ trợ */
  }
}
