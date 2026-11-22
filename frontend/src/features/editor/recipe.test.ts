import { describe, expect, it } from "vitest";
import { DEFAULT_RECIPE, fromUnit, isNeutral, normalizeRecipe, sameRecipe, SLIDER_GROUPS, toUnit } from "./recipe";

describe("normalizeRecipe", () => {
  it("fills missing keys and clamps to each slider's range", () => {
    const r = normalizeRecipe({ exposure: 9, contrast: -500, saturation: 12 });
    expect(r.exposure).toBe(3);
    expect(r.contrast).toBe(-100);
    expect(r.saturation).toBe(12);
    expect(r.vignette).toBe(0);
    expect(r.v).toBe(1);
  });

  it("null / garbage → default", () => {
    expect(normalizeRecipe(null)).toEqual(DEFAULT_RECIPE);
    expect(normalizeRecipe({ tint: Number.NaN })).toEqual(DEFAULT_RECIPE);
  });
});

describe("isNeutral / sameRecipe", () => {
  it("detects any change", () => {
    expect(isNeutral(DEFAULT_RECIPE)).toBe(true);
    expect(isNeutral({ ...DEFAULT_RECIPE, shadows: 1 })).toBe(false);
    expect(sameRecipe(DEFAULT_RECIPE, { ...DEFAULT_RECIPE })).toBe(true);
    expect(sameRecipe(DEFAULT_RECIPE, { ...DEFAULT_RECIPE, tint: -3 })).toBe(false);
  });

  it("every recipe key has exactly one slider", () => {
    const keys = SLIDER_GROUPS.flatMap((g) => g.sliders.map((s) => s.key)).sort();
    expect(keys).toEqual(Object.keys(DEFAULT_RECIPE).filter((k) => k !== "v").sort());
  });
});

describe("toUnit / fromUnit", () => {
  const exposure = SLIDER_GROUPS[0].sliders[0];
  it("round-trips, snaps near 0 and clamps", () => {
    expect(toUnit(exposure, 1.5)).toBe(0.5);
    expect(fromUnit(exposure, 0.5)).toBe(1.5);
    expect(fromUnit(exposure, 0.01)).toBe(0);
    expect(fromUnit(exposure, -7)).toBe(-3);
    expect(fromUnit(exposure, 0.334)).toBe(1);
  });
});
