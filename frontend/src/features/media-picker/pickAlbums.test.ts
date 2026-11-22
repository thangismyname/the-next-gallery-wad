import { describe, expect, it } from "vitest";
import { pickAlbums } from "@tng/shared";

const t = ((key: string) => key) as never;
const album = (id: string, kind: "manual" | "smart") => ({ id, name: id, kind, mediaCount: 3 }) as never;
const auto = (key: string, count: number) => ({ key, count, firstAt: "2024-05-01", lastAt: "2024-05-30", coverUrl: null, group: "time" }) as never;

describe("pickAlbums", () => {
  it("regular manual albums first, then auto groups content → objects → time → type, empty skipped", () => {
    const list = pickAlbums(
      { owned: [album("mine", "manual"), album("rule", "smart")], shared: [album("theirs", "manual")] },
      [
        { id: "time", albums: [auto("month-2024-05", 10), auto("month-2024-04", 0)] },
        { id: "content", albums: [auto("tag-pets", 4)] },
      ],
      t,
      "en",
    );
    expect(list.map((a) => a.key)).toEqual(["album:mine", "album:theirs", "auto:tag-pets", "auto:month-2024-05"]);
    expect(list[2]).toMatchObject({ source: "auto", id: "tag-pets", group: "content", count: 4 });
  });
});
