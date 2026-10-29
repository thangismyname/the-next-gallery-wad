import { useLocation } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { pageFade } from "@/lib/motion";

/**
 * Đổi trang → nội dung mờ dần vào. CHỈ opacity: transform ở đây sẽ làm lệch
 * phép đo của lưới ảo hoá (scrollMargin) và biến mọi phần tử `fixed` bên trong
 * trang (thanh chọn ảnh, Lightbox) thành tương đối với khung.
 * Key theo pathname → đổi ?query (bộ lọc) không chạy lại.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  return (
    <motion.div key={pathname} {...pageFade}>
      {children}
    </motion.div>
  );
}
