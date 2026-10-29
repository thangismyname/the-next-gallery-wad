import { useTranslation } from "react-i18next";
import { Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { AI_CHIP } from "@/lib/aiColors";
import { useRef } from "react";
import {
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { Reveal } from "./Reveal";
import { boxDraw, captionIn, chipSpring, photoAppear } from "../landing.motion";
import { useTypewriter } from "@/hooks/useTypewriter";
import streetImage from "@/assets/images/image_3.jpg";
import portraitImage from "@/assets/images/image_2.jpg";
import carImage from "@/assets/images/image_5.jpg";

type Box = {
  label: string;
  conf: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type Shot = {
  src: string;
  width: number;
  height: number;
  /** Tỉ lệ khung + vị trí cắt — bbox tính theo vùng ảnh đang hiển thị. */
  aspect: string;
  position?: string;
  boxes: Box[];
  tag: { key: string; conf: number };
};

// Minh hoạ đúng thứ app làm với mỗi ảnh: khung vật thể YOLO26 (0–1) + tag nội
// dung kèm độ tin cậy. Tọa độ canh tay theo nội dung từng ảnh.
const SHOTS: Shot[] = [
  {
    src: streetImage,
    width: 736,
    height: 919,
    aspect: "aspect-[736/919]",
    boxes: [
      { label: "person", conf: 96, x1: 0.17, y1: 0.23, x2: 0.79, y2: 0.98 },
      { label: "person", conf: 88, x1: 0.78, y1: 0.43, x2: 0.98, y2: 0.62 },
    ],
    tag: { key: "street", conf: 97 },
  },
  {
    src: portraitImage,
    width: 736,
    height: 981,
    aspect: "aspect-[736/981]",
    boxes: [
      { label: "person", conf: 98, x1: 0.24, y1: 0.23, x2: 0.81, y2: 0.94 },
    ],
    tag: { key: "portrait", conf: 92 },
  },
  {
    src: carImage,
    width: 736,
    height: 1308,
    // Ảnh dọc 9:16 cắt thành 4:3 quanh chiếc xe (object-position 78.5%).
    aspect: "aspect-[4/3]",
    position: "50% 78.5%",
    boxes: [{ label: "car", conf: 97, x1: 0.04, y1: 0.35, x2: 0.94, y2: 0.66 }],
    tag: { key: "vehicles", conf: 99 },
  },
];

function Photo({
  shot,
  className,
  y,
  delay = 0,
}: {
  shot: Shot;
  className?: string;
  /** Parallax: độ lệch dọc theo tiến độ cuộn của cả cụm. */
  y?: MotionValue<number>;
  delay?: number;
}) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  // Ảnh hiện → khung YOLO "vẽ" vào → nhãn tag bật ra.
  const show = reduce || inView;

  return (
    <motion.figure
      ref={ref}
      style={reduce ? undefined : { y }}
      {...photoAppear(show, delay, reduce)}
      className={cn(
        "group/photo relative overflow-hidden rounded-2xl border border-border/60 bg-muted shadow-xl shadow-black/10",
        shot.aspect,
        className,
      )}
    >
      <img
        src={shot.src}
        width={shot.width}
        height={shot.height}
        alt=""
        loading="lazy"
        decoding="async"
        className="absolute inset-0 size-full object-cover transition-transform duration-700 ease-out group-hover/photo:scale-105"
        style={shot.position ? { objectPosition: shot.position } : undefined}
      />
      {shot.boxes.map((box, i) => (
        <motion.div
          key={i}
          {...boxDraw(show, delay, i, reduce)}
          className="absolute rounded-md border-2 border-emerald-400/90 shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
          style={{
            left: `${box.x1 * 100}%`,
            top: `${box.y1 * 100}%`,
            width: `${(box.x2 - box.x1) * 100}%`,
            height: `${(box.y2 - box.y1) * 100}%`,
          }}
        >
          <span className="absolute -top-px -left-0.5 -translate-y-full rounded-t-md bg-emerald-400 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-black">
            {box.label} {box.conf}%
          </span>
        </motion.div>
      ))}
      <motion.figcaption
        {...captionIn(show, delay, reduce)}
        className="absolute right-2 bottom-2 flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[11px] font-medium text-white backdrop-blur"
      >
        <Sparkles className="size-3" />
        {t(`studio.tags.${shot.tag.key}`)} · {shot.tag.conf}%
      </motion.figcaption>
    </motion.figure>
  );
}

/** Ảnh minh hoạ AI: khung nhận diện + tag + ô tìm kiếm mẫu (search kết hợp). */
export function AiShowcase() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const [street, portrait, car] = SHOTS;

  // Parallax: 3 ảnh trôi với tốc độ khác nhau khi cuộn qua section.
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const yLeft = useTransform(scrollYProgress, [0, 1], [40, -40]);
  const yRight = useTransform(scrollYProgress, [0, 1], [80, -60]);

  // Ô tìm kiếm: gõ dần câu mẫu khi lọt vào màn hình → xong thì chip lần lượt hiện.
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInView = useInView(searchRef, { once: true, amount: 0.8 });
  const { typed, done } = useTypewriter(t("preview.query"), searchInView, {
    instant: Boolean(reduce),
  });
  const chips = [
    { cls: AI_CHIP.yolo, text: "YOLO · person ×2" },
    { cls: AI_CHIP.tag, text: `Tag · ${t("studio.tags.street")}` },
    { cls: AI_CHIP.clip, text: "CLIP · 94%" },
  ];

  return (
    <section className="border-t border-border/60">
      <div className="mx-auto max-w-7xl px-6 pt-10 pb-20">
        <div ref={ref} className="relative mx-auto w-full max-w-3xl">
          <div className="grid grid-cols-[1.15fr_1fr] gap-3 sm:gap-4">
            <Photo shot={street} y={yLeft} className="row-span-2 self-start" />
            <Photo shot={portrait} y={yRight} delay={0.12} />
            <Photo shot={car} y={yRight} delay={0.24} />
          </div>

          {/* Ô tìm kiếm mẫu — câu được tách thành CLIP + tag + vật thể */}
          {/* Trải hết chiều ngang cụm ảnh: ô tìm kiếm bên trái, chip phân tích câu bên phải */}
          <Reveal
            delay={0.35}
            y={20}
            className="glass absolute inset-x-3 -bottom-6 z-10 flex flex-col gap-2 rounded-2xl p-3 sm:inset-x-4 sm:flex-row sm:items-center sm:gap-3"
          >
            <div
              ref={searchRef}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-muted/70 px-3 py-2 text-sm"
            >
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">
                {typed}
                {/* Con trỏ nhấp nháy khi đang gõ */}
                {!done && (
                  <span className="ml-px inline-block h-4 w-px animate-pulse bg-foreground align-middle" />
                )}
                {/* Giữ chiều cao khi chưa gõ chữ nào */}
                {typed.length === 0 && "\u00A0"}
              </span>
            </div>
            <div className="flex min-h-5 shrink-0 flex-wrap gap-1.5 text-[11px]">
              {chips.map((chip, i) => (
                <motion.span
                  key={chip.text}
                  {...chipSpring(done, i, reduce)}
                  className={cn("rounded-full px-2 py-0.5 font-medium", chip.cls)}
                >
                  {chip.text}
                </motion.span>
              ))}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
