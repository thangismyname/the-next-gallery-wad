import { useRef, type TouchEvent as ReactTouchEvent } from "react";

const distance = (e: ReactTouchEvent) => {
  const [a, b] = [e.touches[0], e.touches[1]];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
};

/**
 * Hai ngón tay chụm / mở trên khung ngắm → zoom = zoom lúc bắt đầu × tỉ lệ khoảng
 * cách. `enabled = false` (track không hỗ trợ zoom) → không làm gì, để trình duyệt
 * xử lý cử chỉ như thường.
 */
export function usePinchZoom(enabled: boolean, zoom: number, onZoom: (value: number) => void) {
  const start = useRef<{ dist: number; zoom: number } | null>(null);

  const onTouchStart = (e: ReactTouchEvent<HTMLElement>) => {
    if (!enabled || e.touches.length !== 2) return;
    start.current = { dist: distance(e), zoom };
  };
  const onTouchMove = (e: ReactTouchEvent<HTMLElement>) => {
    const s = start.current;
    if (!s || e.touches.length !== 2 || s.dist <= 0) return;
    onZoom(s.zoom * (distance(e) / s.dist));
  };
  const onTouchEnd = (e: ReactTouchEvent<HTMLElement>) => {
    if (e.touches.length < 2) start.current = null;
  };

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd };
}
