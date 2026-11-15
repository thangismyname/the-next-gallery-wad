import { autoAlbumName } from "@tng/shared";
import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";

// t giả: trả key (+ date) để kiểm tra key nào được dùng.
const t = ((key: string, opts?: { date?: string; defaultValue?: string }) =>
  opts?.date ? `${key}|${opts.date}` : key) as unknown as TFunction;
const album = (key: string, firstAt = "2026-02-06T08:00:00", lastAt = firstAt) => ({ key, firstAt, lastAt });

describe("autoAlbumName", () => {
  it("maps type / tag / object keys to i18n keys", () => {
    expect(autoAlbumName(album("type-videos"), t, "en")).toBe("albums.auto.type.videos");
    expect(autoAlbumName(album("tag-pets"), t, "en")).toBe("studio.tags.pets");
    expect(autoAlbumName(album("tag-other"), t, "en")).toBe("albums.auto.otherTag");
    expect(autoAlbumName(album("object-animal"), t, "en")).toBe("albums.auto.objects.animal");
  });

  it("formats months in the locale, capitalised", () => {
    expect(autoAlbumName(album("month-2026-02"), t, "en")).toBe("February 2026");
    expect(autoAlbumName(album("month-2026-02"), t, "vi")).toMatch(/^Tháng 2/);
  });

  it("formats an event as one day or a range", () => {
    expect(autoAlbumName(album("event-202602060800"), t, "en")).toBe("albums.auto.event|Feb 6, 2026");
    expect(
      autoAlbumName(album("event-202602060800", "2026-02-06T08:00:00", "2026-02-07T20:00:00"), t, "en"),
    ).toBe("albums.auto.event|Feb 6 – Feb 7, 2026");
  });

  it("falls back to the raw key", () => {
    expect(autoAlbumName(album("weird"), t, "en")).toBe("weird");
  });
});
