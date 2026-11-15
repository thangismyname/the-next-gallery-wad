import { describe, expect, it } from "vitest";
import {
  centerCrop,
  clampZoom,
  fitCropBox,
  formatTimer,
  formatZoom,
  readTrackCaps,
  zoomPresets,
} from "./camera.media";

describe("formatTimer", () => {
  it.each([
    [0, "0:00"],
    [5, "0:05"],
    [75, "1:15"],
  ])("%i s → %s", (s, out) => expect(formatTimer(s)).toBe(out));
});

describe("fitCropBox", () => {
  it("keeps the whole box for free ratio", () => {
    expect(fitCropBox(400, 300, null)).toEqual({ w: 400, h: 300 });
  });
  it("fits a square inside a landscape box (full height)", () => {
    expect(fitCropBox(400, 300, 1)).toEqual({ w: 300, h: 300 });
  });
  it("fits 16:9 inside a portrait box (full width)", () => {
    expect(fitCropBox(300, 600, 16 / 9)).toEqual({ w: 300, h: 169 });
  });
});

describe("centerCrop", () => {
  it("crops the sides of a wide frame, centred", () => {
    expect(centerCrop(1280, 720, 1)).toEqual({ sx: 280, sy: 0, sw: 720, sh: 720 });
  });
  it("crops top and bottom of a tall frame, centred", () => {
    expect(centerCrop(720, 1280, 1)).toEqual({ sx: 0, sy: 280, sw: 720, sh: 720 });
  });
  it("returns the full frame without a target ratio", () => {
    expect(centerCrop(1280, 720, null)).toEqual({ sx: 0, sy: 0, sw: 1280, sh: 720 });
  });
});

describe("readTrackCaps", () => {
  const track = (caps: object) => ({ getCapabilities: () => caps }) as unknown as MediaStreamTrack;
  it("reads zoom range + torch", () => {
    expect(readTrackCaps(track({ zoom: { min: 1, max: 8, step: 0.1 }, torch: true }))).toEqual({
      zoom: { min: 1, max: 8, step: 0.1 },
      torch: true,
    });
  });
  it("ignores an empty zoom range and missing capabilities", () => {
    expect(readTrackCaps(track({ zoom: { min: 1, max: 1 } }))).toEqual({ zoom: null, torch: false });
    expect(readTrackCaps(undefined)).toEqual({ zoom: null, torch: false });
  });
});

describe("clampZoom", () => {
  const range = { min: 1, max: 4, step: 0.5 };
  it.each([
    [0.2, 1],
    [9, 4],
    [2.2, 2],
    [2.3, 2.5],
  ])("%f → %f", (v, out) => expect(clampZoom(v, range)).toBe(out));
});

describe("zoomPresets", () => {
  it("keeps presets inside the range", () => {
    expect(zoomPresets({ min: 1, max: 3, step: 0.1 })).toEqual([1, 2]);
    expect(zoomPresets({ min: 0.5, max: 10, step: 0.1 })).toEqual([0.5, 1, 2, 5, 10]);
  });
});

describe("formatZoom", () => {
  it.each([
    [1, "1×"],
    [1.46, "1.5×"],
    [0.5, "0.5×"],
  ])("%f → %s", (z, out) => expect(formatZoom(z)).toBe(out));
});
