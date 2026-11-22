import { describe, expect, it } from "vitest";

import { nextHidden } from "./useHideOnScroll";

describe("nextHidden", () => {
  it("always shows near the top", () => expect(nextHidden(20, 30, true)).toBe(false));
  it("hides on a scroll down, shows on a scroll up", () => {
    expect(nextHidden(300, 10, false)).toBe(true);
    expect(nextHidden(300, -10, true)).toBe(false);
  });
  it("ignores small jitter", () => {
    expect(nextHidden(300, 2, true)).toBe(true);
    expect(nextHidden(300, -2, false)).toBe(false);
  });
});
