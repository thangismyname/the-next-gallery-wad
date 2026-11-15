export type CameraMode = "photo" | "video" | "moments";
export type FacingMode = "user" | "environment";
export type CameraError = "denied" | "unsupported";
export type AspectRatio = "free" | "1:1" | "4:3" | "3:4" | "16:9" | "9:16";
export type TimerOption = 0 | 3 | 5;

export interface CameraPreview {
  kind: "photo" | "video";
  url: string;
  file: File;
  /** Chế độ đã tạo ra bản xem trước — "moments" sẽ tự đăng lên Moments. */
  mode: CameraMode;
}

export const MOMENTS_MAX_DURATION = 5; // giây, Locket-style

export const VIDEO_MIMES = [
  "video/mp4;codecs=avc1.4d002a",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm",
];

export const ASPECT_RATIOS: { value: AspectRatio }[] = [
  { value: "free" },
  { value: "1:1" },
  { value: "4:3" },
  { value: "3:4" },
  { value: "16:9" },
  { value: "9:16" },
];

export const RATIO_MAP: Record<AspectRatio, number | null> = {
  free: null,
  "1:1": 1,
  "4:3": 4 / 3,
  "3:4": 3 / 4,
  "16:9": 16 / 9,
  "9:16": 9 / 16,
};