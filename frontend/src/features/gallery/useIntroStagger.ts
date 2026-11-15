import { useEffect, useState } from "react";

/**
 * Lần đầu có dữ liệu: các hàng đầu hiện nối nhau (CSS tw-animate, lệch
 * `stepMs` mỗi hàng, tối đa `maxSteps`). Sau `windowMs` tắt hẳn → hàng mới
 * mount khi cuộn (lưới ảo hoá) KHÔNG animate lại.
 * @returns rowAppear(index) → { className, style } gắn vào hàng.
 */
export function useIntroStagger(ready: boolean, { stepMs = 40, maxSteps = 10, windowMs = 800 } = {}) {
  const [intro, setIntro] = useState(true);
  useEffect(() => {
    if (!ready || !intro) return;
    const timer = window.setTimeout(() => setIntro(false), windowMs);
    return () => window.clearTimeout(timer);
  }, [ready, intro, windowMs]);

  return (index: number) =>
    intro
      ? {
          className:
            "animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-300 motion-reduce:animate-none",
          style: { animationDelay: `${Math.min(index, maxSteps) * stepMs}ms` },
        }
      : { className: "", style: undefined };
}
