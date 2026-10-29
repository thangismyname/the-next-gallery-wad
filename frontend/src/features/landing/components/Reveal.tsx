// Hiệu ứng xuất hiện khi cuộn tới cho landing (framer-motion).
//   <Reveal>…</Reveal>                    1 khối: mờ → rõ + trượt lên
//   <RevealGroup><RevealItem/>…</RevealGroup>  nhiều khối lần lượt (stagger)
// Người dùng bật "Giảm chuyển động" (prefers-reduced-motion) → hiện ngay, không animate.
import { motion, useReducedMotion } from "framer-motion";
import { EASE_OUT, revealItem } from "@/lib/motion";

const VIEWPORT = { once: true, amount: 0.2 } as const;

type BaseProps = {
  className?: string;
  children: React.ReactNode;
};

/** 1 khối xuất hiện khi cuộn tới. `delay` (giây) để lệch nhịp với khối khác. */
export function Reveal({
  delay = 0,
  y = 28,
  className,
  children,
}: BaseProps & { delay?: number; y?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.7, ease: EASE_OUT, delay }}
    >
      {children}
    </motion.div>
  );
}

/** Khung cho nhóm RevealItem — các con hiện lần lượt cách nhau `stagger` giây. */
export function RevealGroup({
  stagger = 0.1,
  as = "div",
  className,
  children,
}: BaseProps & { stagger?: number; as?: "div" | "ol" | "ul" | "dl" }) {
  const reduce = useReducedMotion();
  const Comp = motion[as];
  if (reduce) {
    const Plain = as;
    return <Plain className={className}>{children}</Plain>;
  }
  return (
    <Comp
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={VIEWPORT}
      variants={{ hidden: {}, show: { transition: { staggerChildren: stagger } } }}
    >
      {children}
    </Comp>
  );
}

/** 1 phần tử trong RevealGroup (div hoặc li). */
export function RevealItem({
  as = "div",
  className,
  children,
}: BaseProps & { as?: "div" | "li" }) {
  const reduce = useReducedMotion();
  const Comp = motion[as];
  if (reduce) {
    const Plain = as;
    return <Plain className={className}>{children}</Plain>;
  }
  return (
    <Comp className={className} variants={revealItem}>
      {children}
    </Comp>
  );
}
