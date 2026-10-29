// Hiệu ứng nâng cao cho landing — đều tắt khi người dùng bật "Giảm chuyển động".
import { useEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { cn } from "@/lib/utils";

/** Vạch mảnh trên cùng trang chạy theo tiến độ cuộn. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 });
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <motion.div
      aria-hidden
      className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-foreground"
      style={{ scaleX }}
    />
  );
}

/** Băng chữ chạy ngang vô tận (CSS), dừng khi rê chuột. */
export function Marquee({ items, className }: { items: string[]; className?: string }) {
  // Nhân đôi danh sách → dịch -50% là liền mạch.
  const row = [...items, ...items];
  return (
    <div
      className={cn(
        "group relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]",
        className,
      )}
    >
      <div className="animate-marquee flex w-max gap-10 group-hover:[animation-play-state:paused]">
        {row.map((item, i) => (
          <span
            key={i}
            aria-hidden={i >= items.length}
            className="flex items-center gap-10 font-mono text-xs uppercase tracking-[0.25em] whitespace-nowrap text-muted-foreground"
          >
            {item}
            <span className="size-1 rounded-full bg-muted-foreground/50" />
          </span>
        ))}
      </div>
    </div>
  );
}

/** Số đếm từ 0 lên `value` khi cuộn tới (giữ nguyên chữ nếu không phải số). */
export function CountUp({ value, duration = 1.4 }: { value: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const target = Number(value);
  const [shown, setShown] = useState(reduce || !Number.isFinite(target) ? value : "0");

  useEffect(() => {
    if (!inView || reduce || !Number.isFinite(target)) return;
    const controls = animate(0, target, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setShown(String(Math.round(v))),
    });
    return () => controls.stop();
  }, [inView, reduce, target, duration]);

  return (
    <span ref={ref} className="tabular-nums">
      {shown}
    </span>
  );
}

/**
 * Câu lớn "sáng dần" từng chữ theo tiến độ cuộn (kiểu trang sản phẩm Apple):
 * chữ mờ 15% → rõ 100% khi khối đi từ 85% xuống 35% chiều cao màn hình.
 */
export function ScrollWords({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "start 0.35"] });
  const words = text.split(" ");
  if (reduce) return <p className={className}>{text}</p>;
  return (
    <p ref={ref} className={className}>
      {words.map((word, i) => (
        <Word key={i} progress={scrollYProgress} range={[i / words.length, (i + 1) / words.length]}>
          {word}
        </Word>
      ))}
    </p>
  );
}

function Word({
  progress,
  range,
  children,
}: {
  progress: MotionValue<number>;
  range: [number, number];
  children: string;
}) {
  const opacity = useTransform(progress, range, [0.15, 1]);
  return (
    <>
      <motion.span style={{ opacity }}>{children}</motion.span>{" "}
    </>
  );
}
