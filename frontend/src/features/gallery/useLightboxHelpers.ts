// Hook nhỏ của Lightbox — tách khỏi component cho dễ đọc, logic giữ nguyên.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Media } from "@tng/shared";

export type Rect = { left: number; top: number; width: number; height: number };

/**
 * Khung (offset) của 1 phần tử, đo lại khi đổi kích thước / cửa sổ / `trigger`
 * đổi — để đặt overlay bbox YOLO đúng vùng ảnh (object-contain). `enabled`
 * false → null.
 */
export function useElementRect(
  ref: React.RefObject<HTMLElement | null>,
  enabled: boolean,
  trigger: string,
): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) {
      setRect(null);
      return;
    }
    const update = () =>
      setRect({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [ref, enabled, trigger]);
  return rect;
}

/**
 * Preload BẢN DISPLAY của ảnh kề (trái / phải) để chuyển ảnh không bị delay —
 * không bao giờ preload file gốc.
 */
export function usePreloadAdjacent(currentId: string, mediaList: Media[]) {
  useEffect(() => {
    if (mediaList.length === 0) return;
    const idx = mediaList.findIndex((m) => m.id === currentId);
    if (idx === -1) return;
    const adjacent = [
      mediaList[(idx + 1) % mediaList.length],
      mediaList[(idx - 1 + mediaList.length) % mediaList.length],
    ];
    adjacent.forEach((m) => {
      if (m.mediaType === "video" || !m.displayUrl) return;
      const img = new Image();
      img.src = m.displayUrl;
    });
  }, [currentId, mediaList]);
}

/** Hiện khi có tương tác, tự ẩn sau `delayMs` không động tới (filmstrip). `enabled` false → không hiện lại. */
export function useAutoHide(enabled: boolean, delayMs = 3000) {
  const [visible, setVisible] = useState(true);
  const timer = useRef<number | null>(null);

  const show = useCallback(() => {
    if (!enabled) return;
    setVisible(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setVisible(false), delayMs);
  }, [enabled, delayMs]);

  useEffect(() => {
    show();
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [show]);

  return { visible, show };
}
