import type { LabelColor } from "@tng/shared";

/** Label color → dot class (Tailwind palette; keys = API `LABEL_COLORS`, same as web `features/favorites/labelColors.ts`). Dots only — never fill a chip (AI colors). */
export const LABEL_DOT: Record<LabelColor, string> = {
  slate: "bg-zinc-400",
  rose: "bg-rose-500",
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  sky: "bg-sky-500",
  violet: "bg-violet-500",
};
