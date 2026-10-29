// Preset chuyển động riêng của landing (được phép "khoe" hơn app — chậm hơn,
// có nhoè, lặp). Mọi preset nhận `reduce` (prefers-reduced-motion) → tắt hẳn.
import type { MotionProps } from "framer-motion";
import { EASE_OUT, POP_SPRING } from "@/lib/motion";

type Preset = Pick<MotionProps, "initial" | "animate" | "exit" | "transition">;
type Reduce = boolean | null;

/** Hero: mờ + nhoè → rõ + trượt lên, hiện ngay khi tải trang (không chờ cuộn). */
export const fadeRise = (delay: number, reduce: Reduce): Preset =>
  reduce
    ? {}
    : {
        initial: { opacity: 0, y: 32, filter: "blur(8px)" },
        animate: { opacity: 1, y: 0, filter: "blur(0px)" },
        transition: { duration: 0.9, ease: EASE_OUT, delay },
      };

/** Panel menu mobile của header: mở / gập chiều cao. */
export const menuPanel = (reduce: Reduce): Preset => ({
  initial: reduce ? false : { height: 0, opacity: 0 },
  animate: { height: "auto", opacity: 1 },
  exit: reduce ? undefined : { height: 0, opacity: 0 },
  transition: { duration: 0.35, ease: EASE_OUT },
});

/** Link thứ `index` trong menu mobile trượt vào từ trái. */
export const menuItem = (index: number, reduce: Reduce): Preset => ({
  initial: reduce ? false : { opacity: 0, x: -12 },
  animate: { opacity: 1, x: 0 },
  transition: { duration: 0.3, ease: EASE_OUT, delay: 0.05 + index * 0.05 },
});

/** Vạch ngang "vẽ" từ trái sang phải khi cuộn tới (Workflow). */
export const drawLine = (reduce: Reduce): Preset & Pick<MotionProps, "whileInView" | "viewport"> => ({
  initial: reduce ? false : { scaleX: 0 },
  whileInView: { scaleX: 1 },
  viewport: { once: true, amount: 0.6 },
  transition: { duration: 1.4, ease: EASE_OUT },
});

/** Trôi lên xuống nhẹ, lặp mãi (mockup điện thoại). */
export const floatLoop = (reduce: Reduce): Preset =>
  reduce
    ? {}
    : { animate: { y: [0, -10, 0] }, transition: { duration: 6, ease: "easeInOut", repeat: Infinity } };

// ── AiShowcase: ảnh hiện → khung YOLO "vẽ" vào → nhãn tag → chip ─────────

/** Ảnh phóng nhẹ vào khi `show`. */
export const photoAppear = (show: boolean, delay: number, reduce: Reduce): Preset => ({
  initial: reduce ? false : { opacity: 0, scale: 0.94 },
  animate: show ? { opacity: 1, scale: 1 } : undefined,
  transition: { duration: 0.8, ease: EASE_OUT, delay },
});

/** Khung YOLO thứ `index` co từ to về đúng chỗ, sau ảnh 0.45s. */
export const boxDraw = (show: boolean, delay: number, index: number, reduce: Reduce): Preset => ({
  initial: reduce ? false : { opacity: 0, scale: 1.25 },
  animate: show ? { opacity: 1, scale: 1 } : undefined,
  transition: { duration: 0.6, ease: EASE_OUT, delay: delay + 0.45 + index * 0.15 },
});

/** Nhãn tag dưới góc ảnh trượt lên, sau khung. */
export const captionIn = (show: boolean, delay: number, reduce: Reduce): Preset => ({
  initial: reduce ? false : { opacity: 0, y: 8 },
  animate: show ? { opacity: 1, y: 0 } : undefined,
  transition: { duration: 0.5, ease: EASE_OUT, delay: delay + 0.8 },
});

/** Chip phân tích câu bật ra (lò xo) sau khi gõ xong câu mẫu. */
export const chipSpring = (done: boolean, index: number, reduce: Reduce): Preset => ({
  initial: reduce ? false : { opacity: 0, scale: 0.6, y: 6 },
  animate: done ? { opacity: 1, scale: 1, y: 0 } : undefined,
  transition: { ...POP_SPRING, stiffness: 420, damping: 22, delay: index * 0.12 },
});
