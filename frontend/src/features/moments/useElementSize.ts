import { useEffect, useRef, useState } from "react";

export interface ElementSize {
  width: number;
  height: number;
}

/**
 * Đo kích thước **content box** của 1 phần tử (ResizeObserver).
 * Dùng khi layout phải tính theo chỗ thật còn lại (VD: card moment phải vừa
 * cả bề rộng lẫn chiều cao) thay vì đoán bằng breakpoint của viewport.
 *
 * ResizeObserver trả `contentRect` (đã trừ padding) và bắn ngay lần observe
 * đầu tiên → không cần đo tay.
 */
export function useElementSize<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      );
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, width: size.width, height: size.height };
}
