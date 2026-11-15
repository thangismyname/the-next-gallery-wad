import { describe, expect, it } from "vitest";
import { TAG_CATEGORY_SECTION, TAG_SECTION_COLOR, tagColor } from "@tng/shared";
import { TAG_CHIP } from "@/lib/aiColors";
import { SECTION_ICONS, TAG_ICONS } from "./tagCatalog";

// Màu tag theo nhóm (@tng/shared) phải phủ đủ danh mục + nhóm của app.
describe("tag colors", () => {
  it("every detailed-label section has a color with chip classes", () => {
    for (const section of Object.keys(SECTION_ICONS)) {
      const color = TAG_SECTION_COLOR[section];
      expect(color, section).toBeDefined();
      expect(TAG_CHIP[color]).toBeTruthy();
    }
  });

  it("every content category maps to a known section", () => {
    for (const tag of Object.keys(TAG_ICONS)) {
      expect(TAG_CATEGORY_SECTION[tag], tag).toBeDefined();
      expect(SECTION_ICONS[TAG_CATEGORY_SECTION[tag]], tag).toBeDefined();
    }
  });

  it("avoids the AI source colors and falls back to zinc", () => {
    for (const color of Object.values(TAG_SECTION_COLOR)) {
      expect(["emerald", "sky", "violet"]).not.toContain(color);
    }
    expect(tagColor("unknown")).toBe("zinc");
    expect(tagColor("oi.dog", "animals")).toBe("amber");
    expect(tagColor("pets")).toBe("amber");
  });
});
