import { describe, expect, it } from "vitest";

import { isMediaFile } from "./mediaFiles";

describe("isMediaFile", () => {
  it("accepts photos and videos by MIME", () => {
    expect(isMediaFile({ name: "a.jpg", type: "image/jpeg" })).toBe(true);
    expect(isMediaFile({ name: "clip.mp4", type: "video/mp4" })).toBe(true);
  });
  it("accepts HEIC / MOV without a MIME (Windows, Android)", () => {
    expect(isMediaFile({ name: "IMG_1.HEIC", type: "" })).toBe(true);
    expect(isMediaFile({ name: "IMG_2.mov", type: "application/octet-stream" })).toBe(true);
  });
  it("skips Takeout sidecars, SVG and system files", () => {
    expect(isMediaFile({ name: "IMG_1.jpg.supplemental-metadata.json", type: "application/json" })).toBe(false);
    expect(isMediaFile({ name: "logo.svg", type: "image/svg+xml" })).toBe(false);
    expect(isMediaFile({ name: ".DS_Store", type: "" })).toBe(false);
  });
});
