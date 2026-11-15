import type { TagColor } from "@tng/shared";

/**
 * One color per AI source — same as web `frontend/src/lib/aiColors.ts` so users
 * always see where a result comes from: YOLO = emerald, CLIP = sky, Tag
 * (classification) = neutral, DINOv3 = violet. Static classes (Tailwind palette).
 */
export type AiSource = "yolo" | "clip" | "tag" | "dino";

/** Chip on a theme background: light = tinted fill + dark text, dark = translucent fill + colored text. */
export const AI_CHIP: Record<AiSource, { box: string; text: string }> = {
  yolo: { box: "bg-emerald-200 dark:bg-emerald-400/20", text: "text-black dark:text-emerald-300" },
  clip: { box: "bg-sky-200 dark:bg-sky-400/20", text: "text-black dark:text-sky-300" },
  tag: { box: "bg-zinc-200 dark:bg-primary/15", text: "text-black dark:text-foreground" },
  dino: { box: "bg-violet-200 dark:bg-violet-400/20", text: "text-black dark:text-violet-300" },
};

/** Progress bars / dots per AI source (web `AI_BAR`). */
export const AI_BAR: Record<AiSource, string> = {
  yolo: "bg-emerald-500",
  clip: "bg-sky-500",
  tag: "bg-primary",
  dino: "bg-violet-500",
};

/**
 * Content tags (categories + detailed labels) colored by group — color name from
 * `@tng/shared` `tagColor(tag, section)`, same as the web `TAG_CHIP`.
 */
export const TAG_CHIP: Record<TagColor, { box: string; text: string }> = {
  rose: { box: "bg-rose-100 dark:bg-rose-400/15", text: "text-rose-900 dark:text-rose-200" },
  amber: { box: "bg-amber-100 dark:bg-amber-400/15", text: "text-amber-900 dark:text-amber-200" },
  orange: { box: "bg-orange-100 dark:bg-orange-400/15", text: "text-orange-900 dark:text-orange-200" },
  lime: { box: "bg-lime-100 dark:bg-lime-400/15", text: "text-lime-900 dark:text-lime-200" },
  cyan: { box: "bg-cyan-100 dark:bg-cyan-400/15", text: "text-cyan-900 dark:text-cyan-200" },
  blue: { box: "bg-blue-100 dark:bg-blue-400/15", text: "text-blue-900 dark:text-blue-200" },
  slate: { box: "bg-slate-100 dark:bg-slate-400/15", text: "text-slate-900 dark:text-slate-200" },
  stone: { box: "bg-stone-100 dark:bg-stone-400/15", text: "text-stone-900 dark:text-stone-200" },
  indigo: { box: "bg-indigo-100 dark:bg-indigo-400/15", text: "text-indigo-900 dark:text-indigo-200" },
  red: { box: "bg-red-100 dark:bg-red-400/15", text: "text-red-900 dark:text-red-200" },
  fuchsia: { box: "bg-fuchsia-100 dark:bg-fuchsia-400/15", text: "text-fuchsia-900 dark:text-fuchsia-200" },
  yellow: { box: "bg-yellow-100 dark:bg-yellow-400/15", text: "text-yellow-900 dark:text-yellow-200" },
  teal: { box: "bg-teal-100 dark:bg-teal-400/15", text: "text-teal-900 dark:text-teal-200" },
  pink: { box: "bg-pink-100 dark:bg-pink-400/15", text: "text-pink-900 dark:text-pink-200" },
  zinc: { box: "bg-zinc-100 dark:bg-zinc-400/15", text: "text-zinc-900 dark:text-zinc-200" },
};
