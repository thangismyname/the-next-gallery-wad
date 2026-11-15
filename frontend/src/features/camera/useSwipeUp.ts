import { useCallback, useRef } from "react";
import type { TouchEvent as ReactTouchEvent } from "react";

const SWIPE_DISTANCE = 60;
const SWIPE_MAX_DURATION = 600;

// Phát hiện cử chỉ vuốt lên (dùng trong Camera → chuyển sang Moments).
// Bỏ qua nếu ngón tay bắt đầu trên một button (shutter, flip...) để tránh điều hướng nhầm.
export function useSwipeUp(onSwipeUp: () => void) {
  const startRef = useRef<{
    x: number;
    y: number;
    target: EventTarget | null;
    t: number;
  } | null>(null);

  const onTouchStart = useCallback((e: ReactTouchEvent<HTMLElement>) => {
    const touch = e.touches[0];
    // Ngón thứ 2 chạm xuống = pinch zoom, không phải vuốt.
    if (!touch || e.touches.length > 1) {
      startRef.current = null;
      return;
    }
    startRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      target: e.target,
      t: Date.now(),
    };
  }, []);

  const onTouchEnd = useCallback(
    (e: ReactTouchEvent<HTMLElement>) => {
      const start = startRef.current;
      startRef.current = null;
      if (!start) return;

      const touch = e.changedTouches[0];
      if (!touch) return;

      if (start.target instanceof HTMLElement && start.target.closest("button")) {
        return;
      }

      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const duration = Date.now() - start.t;

      if (
        dy <= -SWIPE_DISTANCE &&
        Math.abs(dy) > Math.abs(dx) * 1.5 &&
        duration < SWIPE_MAX_DURATION
      ) {
        onSwipeUp();
      }
    },
    [onSwipeUp],
  );

  return { onTouchStart, onTouchEnd };
}