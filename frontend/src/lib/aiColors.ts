import type { TagColor } from "@tng/shared";

// Màu nhận diện từng nguồn AI — dùng chung cho landing và trong app để người
// dùng luôn biết kết quả đến từ đâu: YOLO = xanh lá, CLIP = xanh dương,
// Tag (phân loại) = xám, DINOv3 = tím. Class viết tĩnh để Tailwind quét được.
export type AiSource = "yolo" | "clip" | "tag" | "dino";

/** Chip trên nền theo theme: light = nền nhạt chữ đen, dark = nền trong suốt chữ màu. */
export const AI_CHIP: Record<AiSource, string> = {
  yolo: "bg-emerald-200 text-black dark:bg-emerald-400/20 dark:text-emerald-300",
  clip: "bg-sky-200 text-black dark:bg-sky-400/20 dark:text-sky-300",
  tag: "bg-zinc-200 text-black dark:bg-primary/15 dark:text-foreground",
  dino: "bg-violet-200 text-black dark:bg-violet-400/20 dark:text-violet-300",
};

/** Thanh tiến độ / chấm màu. */
export const AI_BAR: Record<AiSource, string> = {
  yolo: "bg-emerald-500",
  clip: "bg-sky-500",
  tag: "bg-primary",
  dino: "bg-violet-500",
};

/**
 * Tag nội dung (danh mục + nhãn chi tiết) tô theo nhóm — tên màu từ `@tng/shared`
 * `tagColor(tag, section)`. Light = nền nhạt chữ đậm, dark = nền trong suốt chữ sáng.
 * Viết đầy đủ từng class để Tailwind quét được.
 */
export const TAG_CHIP: Record<TagColor, string> = {
  rose: "bg-rose-100 text-rose-900 dark:bg-rose-400/15 dark:text-rose-200",
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200",
  orange: "bg-orange-100 text-orange-900 dark:bg-orange-400/15 dark:text-orange-200",
  lime: "bg-lime-100 text-lime-900 dark:bg-lime-400/15 dark:text-lime-200",
  cyan: "bg-cyan-100 text-cyan-900 dark:bg-cyan-400/15 dark:text-cyan-200",
  blue: "bg-blue-100 text-blue-900 dark:bg-blue-400/15 dark:text-blue-200",
  slate: "bg-slate-100 text-slate-900 dark:bg-slate-400/15 dark:text-slate-200",
  stone: "bg-stone-100 text-stone-900 dark:bg-stone-400/15 dark:text-stone-200",
  indigo: "bg-indigo-100 text-indigo-900 dark:bg-indigo-400/15 dark:text-indigo-200",
  red: "bg-red-100 text-red-900 dark:bg-red-400/15 dark:text-red-200",
  fuchsia: "bg-fuchsia-100 text-fuchsia-900 dark:bg-fuchsia-400/15 dark:text-fuchsia-200",
  yellow: "bg-yellow-100 text-yellow-900 dark:bg-yellow-400/15 dark:text-yellow-200",
  teal: "bg-teal-100 text-teal-900 dark:bg-teal-400/15 dark:text-teal-200",
  pink: "bg-pink-100 text-pink-900 dark:bg-pink-400/15 dark:text-pink-200",
  zinc: "bg-zinc-100 text-zinc-900 dark:bg-zinc-400/15 dark:text-zinc-200",
};
