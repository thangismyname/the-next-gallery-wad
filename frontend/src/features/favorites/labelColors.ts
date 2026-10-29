// Màu nhãn cá nhân — key khớp services/labels.ts::LABEL_COLORS. Class viết
// tĩnh để Tailwind quét được. Chỉ dùng dạng chấm nhỏ, không tô cả chip, để
// không lẫn với màu nguồn AI (lib/aiColors.ts).
import type { LabelColor } from "@/services/labels";

/** Chấm màu (chip, ô ảnh, menu). */
export const LABEL_DOT: Record<LabelColor, string> = {
  slate: "bg-zinc-400",
  rose: "bg-rose-500",
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  sky: "bg-sky-500",
  violet: "bg-violet-500",
};
