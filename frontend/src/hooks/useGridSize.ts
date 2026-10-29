import { useLayoutEffect, useRef, useState } from "react";

/**
 * Bề rộng + vị trí (tính từ đỉnh trang) của 1 khung lưới, theo dõi liên tục.
 * Bề rộng trong state: đổi cỡ cửa sổ mà số cột không đổi thì ô vẫn to / nhỏ
 * theo → virtualizer phải đo lại. `scrollMargin` cho useWindowVirtualizer biết
 * lưới bắt đầu ở đâu. `remeasureKey` đổi (vd banner lỗi hiện / tắt) → đo lại vị trí.
 * Khung phải luôn được render (cả lúc skeleton / trống) để đo được từ đầu.
 */
export function useGridSize<T extends HTMLElement = HTMLDivElement>(remeasureKey?: unknown) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setWidth(rect.width);
      setScrollMargin(rect.top + window.scrollY);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setScrollMargin(el.getBoundingClientRect().top + window.scrollY);
  }, [remeasureKey]);

  return { ref, width, scrollMargin };
}
