import { useState } from "react";
import { useMotionValueEvent, useScroll } from "framer-motion";

/** true khi trang đã cuộn quá `threshold` px (header thu gọn / đổ bóng). */
export function useScrolled(threshold = 24) {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > threshold));
  return scrolled;
}
