import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import { useAnimate, useReducedMotion } from "framer-motion";
import { APP_DURATION, EASE_OUT } from "@/lib/motion";

/**
 * Lightbox phóng ra từ ô ảnh trong lưới khi mở, thu về ô đó khi đóng.
 * Mọi view đều gỡ Lightbox ngay khi onClose → hiệu ứng đóng chạy ở đây rồi
 * mới gọi `onClose`. Ô nguồn = phần tử có `data-media-id` (ImageCard, kết quả
 * Spotlight) nằm NGOÀI Lightbox; không thấy (đã cuộn khỏi màn hình) → phóng
 * nhẹ từ giữa.
 *
 * @param areaRef  vùng ảnh (phần được phóng / thu)
 * @param openId   ảnh lúc mở
 * @param currentId ảnh đang xem lúc đóng (có thể đã đổi bằng ← →)
 * @returns `scope` gắn vào gốc Lightbox (phần nền mờ) + `requestClose`.
 */
export function useLightboxTransition({
  areaRef,
  openId,
  currentId,
  onClose,
}: {
  areaRef: RefObject<HTMLElement | null>;
  openId: string;
  currentId: string;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const closingRef = useRef(false);

  /** Tâm + tỉ lệ của ô nguồn so với vùng ảnh → transform-origin + scale. */
  const thumbOrigin = useCallback(
    (id: string) => {
      const area = areaRef.current;
      if (!area) return null;
      const thumb = Array.from(
        document.querySelectorAll<HTMLElement>(`[data-media-id="${CSS.escape(id)}"]`),
      ).find((el) => !scope.current?.contains(el));
      if (!thumb) return null;
      const r = thumb.getBoundingClientRect();
      if (r.width === 0 || r.bottom < 0 || r.top > window.innerHeight) return null;
      const a = area.getBoundingClientRect();
      return {
        x: r.left + r.width / 2 - a.left,
        y: r.top + r.height / 2 - a.top,
        scale: Math.min(1, Math.max(0.12, Math.max(r.width / a.width, r.height / a.height))),
      };
    },
    [areaRef, scope],
  );

  // Mở: 1 lần khi gắn vào, trước khi vẽ (không nháy khung đầy đủ).
  useLayoutEffect(() => {
    const area = areaRef.current;
    const root = scope.current;
    if (reduce || !area || !root) return;
    const origin = thumbOrigin(openId);
    area.style.transformOrigin = origin ? `${origin.x}px ${origin.y}px` : "50% 50%";
    root.style.opacity = "0";
    animate(root, { opacity: [0, 1] }, { duration: APP_DURATION.base, ease: "easeOut" });
    animate(
      area,
      { scale: [origin?.scale ?? 0.92, 1], opacity: [0, 1] },
      { duration: APP_DURATION.slow, ease: EASE_OUT },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ lúc mở
  }, []);

  const requestClose = useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    const area = areaRef.current;
    const root = scope.current;
    if (reduce || !area || !root) {
      onClose();
      return;
    }
    const origin = thumbOrigin(currentId);
    area.style.transformOrigin = origin ? `${origin.x}px ${origin.y}px` : "50% 50%";
    await Promise.all([
      animate(
        area,
        { scale: origin?.scale ?? 0.92, opacity: 0 },
        { duration: APP_DURATION.base, ease: [0.4, 0, 1, 1] },
      ),
      animate(root, { opacity: 0 }, { duration: APP_DURATION.base, ease: "easeIn" }),
    ]);
    onClose();
  }, [reduce, areaRef, scope, thumbOrigin, currentId, animate, onClose]);

  return { scope, requestClose };
}
