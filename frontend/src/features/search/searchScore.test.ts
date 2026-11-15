import { type MediaListItem } from "@tng/shared";
import { describe, expect, it } from "vitest";
import { describeScoreParts, presentScoreParts, sourceChipsFor } from "./searchScore";

const item = (scoreParts: MediaListItem["scoreParts"]) => ({ scoreParts }) as MediaListItem;

describe("searchScore", () => {
  it("lists only the parts that scored, in CLIP · Tag · Label · YOLO order", () => {
    expect(presentScoreParts({ clip: 0.1, object: 0.9, label: 0.8 })).toEqual(["clip", "label", "object"]);
    expect(presentScoreParts(null)).toEqual([]);
  });

  it("describes parts as percentages", () => {
    expect(describeScoreParts({ clip: 0.08, tag: 0.991, object: 0.94 })).toBe("CLIP 8% · Tag 99% · YOLO 94%");
    expect(describeScoreParts(undefined)).toBeUndefined();
  });

  it("counts tag chips for category tags and detailed labels, drops empty sources", () => {
    const media = [item({ clip: 0.5, tag: 0.9 }), item({ clip: 0.5, label: 0.9 }), item({ clip: 0.5 })];
    expect(sourceChipsFor(media, [])).toEqual([
      { source: "tag", label: "Tag", n: 2 },
      { source: "clip", label: "CLIP", n: 3 },
    ]);
  });
});
