import { describe, expect, it } from "vitest";
import { columnsFor, gridMetrics } from "./gridLayout";

describe("columnsFor", () => {
  const cols = [3, 4, 6, 8] as const;
  it.each([
    [320, 3],
    [639, 3],
    [640, 4],
    [1023, 4],
    [1024, 6],
    [1439, 6],
    [1440, 8],
    [2560, 8],
  ])("width %i → %i columns", (width, expected) => {
    expect(columnsFor(width, cols)).toBe(expected);
  });
});

describe("gridMetrics", () => {
  it("fills the width exactly (no rounding drift)", () => {
    const { gap, cell, rowHeight } = gridMetrics(1000, 6);
    expect(gap).toBe(12);
    expect(cell * 6 + gap * 5).toBeCloseTo(1000);
    expect(rowHeight).toBeCloseTo(cell + gap);
  });

  it("uses a smaller gap on phones and never returns a zero cell", () => {
    expect(gridMetrics(375, 3).gap).toBe(8);
    expect(gridMetrics(0, 4).cell).toBe(1);
  });
});
