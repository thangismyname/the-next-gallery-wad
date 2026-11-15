import { describe, expect, it } from "vitest";
import { avatarCrop, avatarImagePath, avatarLayout } from "@tng/shared";

// Shared crop model (@tng/shared utils/avatar.ts) — used by the web dialog and the mobile screen.
describe("avatar crop", () => {
  const landscape = { width: 2000, height: 1000 };

  it("zoom 1, centered → the middle square of a landscape photo", () => {
    expect(avatarCrop(landscape, 300, 1, 0, 0)).toEqual({ x: 0.25, y: 0, w: 0.5, h: 1 });
  });

  it("pan is clamped so the photo always covers the viewport", () => {
    const l = avatarLayout(landscape, 300, 1, 10_000, 50);
    expect(l.tx).toBe(150); // (600 - 300) / 2
    expect(l.ty).toBe(0);
    expect(avatarCrop(landscape, 300, 1, 10_000, 0).x).toBe(0); // dragged fully right → left edge
  });

  it("zoom 2 halves the crop size", () => {
    const c = avatarCrop({ width: 1000, height: 1000 }, 300, 2, 0, 0);
    expect(c).toEqual({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
  });

  it("builds a relative path the backend parses", () => {
    expect(avatarImagePath("abc")).toBe("/api/profile/avatar/abc");
    expect(avatarImagePath("abc", { x: 0.123456, y: 0, w: 0.5, h: 1 })).toBe("/api/profile/avatar/abc?c=0.1235,0,0.5,1");
  });
});
