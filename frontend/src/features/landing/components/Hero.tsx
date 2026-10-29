import { useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useLandingCta } from "../useLandingCta";
import { fadeRise } from "../landing.motion";
import { Marquee } from "@/components/motion/effects";

// Tên công nghệ / tính năng (tên riêng — không dịch) cho băng chữ chạy.
const MARQUEE = [
  "CLIP semantic search",
  "YOLO26 objects",
  "DINOv3 similar photos",
  "17 content tags",
  "Hybrid search",
  "Smart albums",
  "HEIC · Video",
  "WebRTC P2P",
  "pgvector",
  "vi · en · ja",
];

export function Hero() {
  const { t } = useTranslation();
  // Đã đăng nhập → vào thư viện; chưa → đăng nhập rồi quay về thư viện.
  const { go } = useLandingCta();
  const reduce = useReducedMotion();

  // Parallax: cuộn xuống → tiêu đề trôi chậm hơn trang + mờ dần.
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const titleY = useTransform(scrollYProgress, [0, 1], [0, 140]);
  const titleOpacity = useTransform(scrollYProgress, [0, 0.9], [1, 0.15]);

  // Hiện ngay khi tải trang (landing.motion.ts::fadeRise).
  const enter = (delay: number) => fadeRise(delay, reduce);

  // Tiêu đề hiện TỪNG TỪ (dòng 2 nối tiếp dòng 1).
  const line1 = t("hero.titleLine1").split(" ");
  const line2 = t("hero.titleLine2").split(" ");
  const words = (line: string[], offset: number) =>
    line.map((word, i) => (
      <motion.span key={i} {...enter(0.1 + (offset + i) * 0.07)} className="inline-block">
        {word}
        {i < line.length - 1 && " "}
      </motion.span>
    ));

  return (
    <section ref={ref} className="pt-8 pb-10 md:pt-10">
      <div className="mx-auto max-w-7xl px-6">
        <motion.p
          {...enter(0)}
          className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground"
        >
          {t("hero.eyebrow")}
        </motion.p>
        <motion.h1
          style={reduce ? undefined : { y: titleY, opacity: titleOpacity }}
          className="mt-6 font-heading text-[13vw] leading-[1.15] tracking-tight md:text-[7.5rem]"
        >
          <span className="block">{words(line1, 0)}</span>
          <span className="block">{words(line2, line1.length)}</span>
        </motion.h1>
        <motion.div
          {...enter(0.15 + (line1.length + line2.length) * 0.07)}
          className="mt-10 grid gap-8 md:grid-cols-[1fr_auto_auto] md:items-end"
        >
          <p className="max-w-md font-sans text-sm text-muted-foreground">
            {t("hero.subcopy")}
          </p>
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            {t("hero.stack")}
          </div>
          <Button
            onClick={go}
            className="group rounded-none font-mono text-xs uppercase tracking-widest"
          >
            {t("hero.cta")}
            <ArrowRight className="ml-2 h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
          </Button>
        </motion.div>
      </div>

      {/* Băng chữ chạy — các mô hình / tính năng đứng sau sản phẩm */}
      <motion.div {...enter(0.9)} className="mt-14 border-y border-border/60 py-4">
        <Marquee items={MARQUEE} />
      </motion.div>
    </section>
  );
}
