export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Largest rect with the media's aspect ratio that fits the viewport, centered ("contain"). */
export function fitRect(
  mediaWidth: number | null | undefined,
  mediaHeight: number | null | undefined,
  viewW: number,
  viewH: number,
): Rect {
  if (!mediaWidth || !mediaHeight) return { x: 0, y: 0, width: viewW, height: viewH };
  const scale = Math.min(viewW / mediaWidth, viewH / mediaHeight);
  const width = mediaWidth * scale;
  const height = mediaHeight * scale;
  return { x: (viewW - width) / 2, y: (viewH - height) / 2, width, height };
}

/** The visible rect of `base` after scaling around its center and translating (worklet-safe). */
export function transformRect(base: Rect, scale: number, tx: number, ty: number): Rect {
  "worklet";
  const width = base.width * scale;
  const height = base.height * scale;
  return {
    x: base.x + (base.width - width) / 2 + tx,
    y: base.y + (base.height - height) / 2 + ty,
    width,
    height,
  };
}

/** Max translation that keeps a zoomed image covering the viewport (or centered if smaller). */
export function panBounds(base: Rect, scale: number, viewW: number, viewH: number) {
  "worklet";
  return {
    x: Math.max((base.width * scale - viewW) / 2, 0),
    y: Math.max((base.height * scale - viewH) / 2, 0),
  };
}
