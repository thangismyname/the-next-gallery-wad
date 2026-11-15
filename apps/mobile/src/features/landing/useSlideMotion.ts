import { useEffect, useState } from "react";
import {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  type SharedValue,
} from "react-native-reanimated";

/**
 * Chuyển trang kiểu onboarding iOS / Android (transform + opacity theo vị trí vuốt, bám
 * ngón tay, không timer): trang trượt trọn bề ngang, nội dung **trễ nhẹ** phía sau
 * (`depth` = phần bề ngang bị trễ, 0.04–0.14 → lớp ảnh trễ nhiều hơn chữ → có chiều sâu)
 * và hơi thu nhỏ + mờ khi rời đi — không trôi xa / mờ hẳn như parallax cuộn của web.
 * Reduce Motion → chỉ còn trang trượt.
 * ⚠ Không dùng trong GlassView (opacity < 1 làm Liquid Glass ngừng vẽ — lib/motion.ts).
 */
export function useSlideParallax(scrollX: SharedValue<number>, index: number, width: number, depth = 0.08) {
  const reduce = useReducedMotion();
  return useAnimatedStyle(() => {
    if (reduce || width === 0) return {};
    const p = (scrollX.get() - index * width) / width; // -1 (đang tới) … 0 (đang xem) … 1 (đã qua)
    const d = Math.min(Math.abs(p), 1);
    return {
      opacity: interpolate(d, [0, 1], [1, 0.35], Extrapolation.CLAMP),
      transform: [
        // trễ theo hướng ngược lại hướng trang đang chạy → nội dung "kéo theo" trang
        { translateX: interpolate(p, [-1, 0, 1], [-width * depth, 0, width * depth], Extrapolation.CLAMP) },
        { scale: interpolate(d, [0, 1], [1, 0.94], Extrapolation.CLAMP) },
      ],
    };
  });
}

/**
 * Gõ dần `text` khi `active` (lần đầu slide được xem) — như `useTypewriter` của landing web.
 * Reduce Motion → hiện ngay.
 */
export function useTypewriter(text: string, active: boolean, msPerChar = 40) {
  const reduce = useReducedMotion();
  // [câu đang gõ, số ký tự đã hiện] — đổi ngôn ngữ (câu khác) thì gõ lại từ đầu.
  const [state, setState] = useState<[string, number]>([text, 0]);
  useEffect(() => {
    if (!active || reduce) return;
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      setState([text, n]);
      if (n >= text.length) clearInterval(id);
    }, msPerChar);
    return () => clearInterval(id);
  }, [active, text, reduce, msPerChar]);
  const count = !active ? 0 : reduce ? text.length : state[0] === text ? state[1] : 0;
  return { typed: text.slice(0, count), done: count >= text.length };
}
