import { forwardRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { APP_DURATION, EASE_OUT } from "@/lib/motion";

/**
 * 1 ô trong lưới ảnh KHÔNG ảo hoá (Yêu thích, Thùng rác, Album…): bọc trong
 * <AnimatePresence initial={false} mode="popLayout"> → ảnh bị xoá / gỡ thu
 * nhỏ rồi mờ đi, các ô còn lại TRƯỢT lấp chỗ (layout) thay vì nhảy cái rụp;
 * ảnh mới thêm phóng nhẹ vào. Lần đầu render không animate (initial={false}).
 */
export const AnimatedGridItem = forwardRef<HTMLDivElement, { children: React.ReactNode }>(
  function AnimatedGridItem({ children }, ref) {
    const reduce = useReducedMotion();
    if (reduce) return <div ref={ref}>{children}</div>;
    return (
      <motion.div
        ref={ref}
        layout
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.85 }}
        transition={{ duration: APP_DURATION.base, ease: EASE_OUT }}
      >
        {children}
      </motion.div>
    );
  },
);
