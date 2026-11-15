// Công thức chỉnh ảnh (basic edit) — thứ duy nhất được lưu (non-destructive).
// Khoảng giá trị khớp backend `media.schema.js::editRecipeSchema` (đổi cả 2).
import type { EditRecipe } from "@tng/shared";

export type AdjustKey = Exclude<keyof EditRecipe, "v">;

export const DEFAULT_RECIPE: EditRecipe = {
  v: 1,
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temperature: 0,
  tint: 0,
  vibrance: 0,
  saturation: 0,
  vignette: 0,
};

export type SliderDef = { key: AdjustKey; min: number; max: number; step: number };

const pct = (key: AdjustKey): SliderDef => ({ key, min: -100, max: 100, step: 1 });

/** Thanh trượt theo nhóm (thứ tự hiển thị) — tên ở i18n `editor.adjust.<key>`. */
export const SLIDER_GROUPS: { id: "light" | "color" | "effects"; sliders: SliderDef[] }[] = [
  {
    id: "light",
    sliders: [
      { key: "exposure", min: -3, max: 3, step: 0.05 },
      pct("contrast"),
      pct("highlights"),
      pct("shadows"),
      pct("whites"),
      pct("blacks"),
    ],
  },
  { id: "color", sliders: [pct("temperature"), pct("tint"), pct("vibrance"), pct("saturation")] },
  { id: "effects", sliders: [pct("vignette")] },
];

const SLIDERS = SLIDER_GROUPS.flatMap((g) => g.sliders);

/** Công thức từ server (có thể thiếu key / ngoài khoảng) → công thức hợp lệ đủ key. */
export function normalizeRecipe(input: Partial<EditRecipe> | null | undefined): EditRecipe {
  const out: EditRecipe = { ...DEFAULT_RECIPE };
  for (const { key, min, max } of SLIDERS) {
    const value = Number(input?.[key]);
    out[key] = Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : 0;
  }
  return out;
}

/** Không chỉnh gì (mọi thanh = 0). */
export const isNeutral = (r: EditRecipe) => SLIDERS.every(({ key }) => r[key] === 0);

export const sameRecipe = (a: EditRecipe, b: EditRecipe) => SLIDERS.every(({ key }) => a[key] === b[key]);
