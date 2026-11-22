/** Playback speeds offered by the video players (web Lightbox + mobile Lightbox). */
export const VIDEO_SPEEDS = [0.5, 1, 2] as const;
export type VideoSpeed = (typeof VIDEO_SPEEDS)[number];

/** Clamp a volume to 0–1 (2 decimals). */
export const clampVolume = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;
