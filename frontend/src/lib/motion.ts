// Thông số chuyển động dùng chung (landing + app).
import type { MotionProps, Transition, Variants } from "framer-motion";

// Đường cong "ease-out-expo" — nhanh lúc đầu, dừng êm (kiểu Apple / Linear).
export const EASE_OUT: Transition["ease"] = [0.22, 1, 0.36, 1];

/** Biến thể của 1 phần tử trong RevealGroup: mờ + thấp → rõ + đúng chỗ. */
export const revealItem: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE_OUT } },
};

// ── Trong app (dùng hằng ngày) — cùng đường cong với landing nhưng NHANH hơn
// nhiều: chuyển động chỉ để báo "cái gì vừa đổi", không bắt người dùng chờ.
export const APP_DURATION = { fast: 0.15, base: 0.22, slow: 0.32 } as const;

/** Lò xo cho chip / badge "bật" ra (chip AI, dấu chọn ảnh). */
export const POP_SPRING: Transition = { type: "spring", stiffness: 480, damping: 24 };

type MotionPreset = Pick<MotionProps, "initial" | "animate" | "exit" | "transition">;

/** Chip / badge thứ `index` "bật" ra (lò xo, lần lượt cách `step` giây). */
export const popIn = (index: number, reduce: boolean | null, step = 0.05): MotionPreset => ({
  initial: reduce ? false : { opacity: 0, scale: 0.6 },
  animate: { opacity: 1, scale: 1 },
  transition: { ...POP_SPRING, delay: index * step },
});

/** Thanh nổi đổi nội dung (BottomBar: điều hướng ↔ thao tác chọn ảnh). */
export const floatingSwap: MotionPreset = {
  initial: { opacity: 0, y: 8, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 8, scale: 0.95 },
  transition: { duration: 0.18 },
};

/** Đổi trang: chỉ opacity (xem components/motion/PageTransition.tsx). */
export const pageFade: MotionPreset = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: APP_DURATION.base, ease: "easeOut" },
};
