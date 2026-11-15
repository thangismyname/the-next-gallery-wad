// Aspect-ratio frame of the camera (pure math, no React / native modules).
// The preview fills the screen like `resizeMode: cover`, so the photo the sensor
// takes is bigger than what is visible. The frame drawn on screen is mapped back
// onto the photo, so the saved crop is exactly what the user framed.

export type Size = { width: number; height: number };
export type Rect = { x: number; y: number; width: number; height: number };

/** Largest `ratio` (w / h) rectangle centered in `area`; null ratio = no frame. */
export function fitFrame(area: Rect, ratio: number | null): Rect | null {
  if (!ratio || area.width <= 0 || area.height <= 0) return null;
  let width = area.width;
  let height = width / ratio;
  if (height > area.height) {
    height = area.height;
    width = height * ratio;
  }
  return {
    x: area.x + (area.width - width) / 2,
    y: area.y + (area.height - height) / 2,
    width,
    height,
  };
}

/**
 * `frame` (screen points, preview of size `screen` drawn "cover") → crop rectangle in
 * photo pixels, clamped inside the photo. The frame is horizontally centered, so a
 * mirrored front-camera preview maps to the same crop.
 */
export function frameToPhotoCrop(frame: Rect, screen: Size, photo: Size): Rect {
  const scale = Math.max(screen.width / photo.width, screen.height / photo.height);
  const offX = (screen.width - photo.width * scale) / 2;
  const offY = (screen.height - photo.height * scale) / 2;
  const x = Math.max(0, (frame.x - offX) / scale);
  const y = Math.max(0, (frame.y - offY) / scale);
  const width = Math.min(photo.width - x, frame.width / scale);
  const height = Math.min(photo.height - y, frame.height / scale);
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.max(1, Math.floor(width)),
    height: Math.max(1, Math.floor(height)),
  };
}
