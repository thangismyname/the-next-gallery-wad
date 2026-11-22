import { describe, expect, it } from "vitest";
import { DEFAULT_FRAMING, framingOrNull, panFraming, zoomFraming } from "@tng/shared";
import { framingStyle } from "./framing";

// 400×300 photo in a 240×160 frame: cover scale = max(0.6, 0.533) = 0.6
// → rendered 240×180: no horizontal overflow, 20px vertical overflow.
const box = { frameW: 240, frameH: 160, imgW: 400, imgH: 300 };

describe("moment framing", () => {
  it("pans only along the overflowing axis, dragging down lowers y, clamped to 0–1", () => {
    const f = panFraming(DEFAULT_FRAMING, 50, 10, box);
    expect(f.x).toBe(0.5); // no horizontal overflow at zoom 1
    expect(f.y).toBeCloseTo(0.5 - 10 / 20);
    expect(panFraming(DEFAULT_FRAMING, 0, -500, box).y).toBe(1);
  });

  it("zoom opens up the other axis and is clamped to 1–3", () => {
    const zoomed = zoomFraming(DEFAULT_FRAMING, 2);
    expect(panFraming(zoomed, 24, 0, box).x).toBeCloseTo(0.5 - 24 / 240);
    expect(zoomFraming(DEFAULT_FRAMING, 9).zoom).toBe(3);
    expect(zoomFraming(DEFAULT_FRAMING, 0.2).zoom).toBe(1);
  });

  it("untouched framing is not stored; CSS mirrors x / y / zoom", () => {
    expect(framingOrNull(DEFAULT_FRAMING)).toBeNull();
    expect(framingOrNull(undefined)).toBeNull();
    expect(framingStyle({ x: 0.25, y: 1, zoom: 2 })).toEqual({
      objectPosition: "25% 100%",
      transformOrigin: "25% 100%",
      transform: "scale(2)",
    });
    expect(framingStyle(null)).toBeUndefined();
  });
});

describe("framingRect (RN equivalent of the CSS)", () => {
  it("zoom 1 = object-position; zoom keeps the origin point fixed", async () => {
    const { framingRect } = await import("@tng/shared");
    const frame = { width: 240, height: 160 };
    const media = { width: 400, height: 300 }; // cover → 240×180, 20px vertical overflow
    expect(framingRect(null, frame, media)).toEqual({ left: 0, top: -10, width: 240, height: 180 });
    expect(framingRect({ x: 0.5, y: 0, zoom: 1 }, frame, media).top).toBe(0);
    const z = framingRect({ x: 0.5, y: 0.5, zoom: 2 }, frame, media);
    expect(z).toEqual({ left: -120, top: -100, width: 480, height: 360 });
  });
});

describe("fillLayout", () => {
  it("my placed slots → photo index, others' filled slots → their photo, rest empty", async () => {
    const { fillLayout } = await import("@tng/shared");
    const slot = (slotIndex: number, filled: boolean) =>
      ({ slotIndex, filled, displayUrl: filled ? `/d${slotIndex}` : null, thumbnailUrl: null, framing: null }) as never;
    // trio: friend filled slot 0; I hold slots 1 + 2 and put my only photo in slot 2.
    expect(fillLayout([slot(2, false), slot(0, true), slot(1, false)], { 2: 0 })).toEqual([
      { src: "/d0", framing: null },
      null,
      0,
    ]);
  });
});

describe("cells (frame → my photo)", () => {
  it("toggle fills the first free frame, limit 1 replaces in place, move swaps", async () => {
    const { toggleInCells, moveInCells } = await import("@tng/shared");
    expect(toggleInCells([], "a", 3, 2)).toEqual(["a", null, null]);
    expect(toggleInCells(["a", null, null], "b", 3, 2)).toEqual(["a", "b", null]);
    expect(toggleInCells(["a", "b", null], "c", 3, 2)).toEqual(["a", "b", null]); // at the limit
    expect(toggleInCells([null, "a", null], "b", 3, 1)).toEqual([null, "b", null]);
    expect(toggleInCells(["a", "b"], "a", 2, 2)).toEqual([null, "b"]);
    expect(moveInCells(["a", null, null], 0, 2, 3)).toEqual([null, null, "a"]);
    expect(moveInCells(["a", "b", null], 0, 1, 3)).toEqual(["b", "a", null]);
  });
});
