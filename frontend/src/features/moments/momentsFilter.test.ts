import { describe, expect, it } from "vitest";
import { feedPeople, filterMoments, isMomentUnseen, laterIso, momentCover, momentPictures, type Moment } from "@tng/shared";

const moment = (id: string, userId: string, createdAt: string, extra: Partial<Moment> = {}): Moment => ({
  id,
  userId,
  userName: userId.toUpperCase(),
  template: "single",
  slots: [],
  mediaId: null,
  mediaType: "photo",
  caption: null,
  thumbnailUrl: null,
  url: null,
  width: 1,
  height: 1,
  createdAt,
  isOwn: userId === "me",
  reactions: [],
  recentReactions: [],
  myReaction: null,
  ...extra,
});

const slot = (userId: string, filled = true) => ({
  slotIndex: 0,
  userId,
  userName: userId,
  userAvatarUrl: null,
  mediaId: null,
  mediaType: "photo" as const,
  thumbnailUrl: null,
  url: null,
  width: 1,
  height: 1,
  filled,
  missing: false,
  filledAt: null,
});

const feed = [
  moment("1", "lan", "2026-11-09T10:00:00Z"),
  moment("2", "me", "2026-11-09T09:00:00Z", { template: "duo_square", slots: [slot("me"), slot("an")] }),
  moment("3", "an", "2026-11-08T09:00:00Z"),
];

describe("isMomentUnseen", () => {
  it("friends' moments after the mark are new, mine never", () => {
    expect(isMomentUnseen(feed[0], "2026-11-09T09:30:00Z")).toBe(true);
    expect(isMomentUnseen(feed[2], "2026-11-09T09:30:00Z")).toBe(false);
    expect(isMomentUnseen(feed[1], null)).toBe(false);
    expect(isMomentUnseen(feed[2], null)).toBe(true);
  });
});

describe("feedPeople", () => {
  it("lists friends (not me), newest first, collab participants included", () => {
    const people = feedPeople(feed, "me", "2026-11-09T09:30:00Z");
    expect(people.map((p) => p.userId)).toEqual(["lan", "an"]);
    expect(people.find((p) => p.userId === "lan")?.unseen).toBe(true);
    expect(people.find((p) => p.userId === "an")?.unseen).toBe(false);
  });
});

describe("filterMoments", () => {
  it("me = posted by me or I'm in it; a person = they're in it", () => {
    expect(filterMoments(feed, "all", "me")).toHaveLength(3);
    expect(filterMoments(feed, "me", "me").map((m) => m.id)).toEqual(["2"]);
    expect(filterMoments(feed, { userId: "an" }, "me").map((m) => m.id)).toEqual(["2", "3"]);
  });
});

describe("laterIso", () => {
  it("keeps the newer timestamp", () => {
    expect(laterIso(null, "2026-01-01T00:00:00Z")).toBe("2026-01-01T00:00:00Z");
    expect(laterIso("2026-02-01T00:00:00Z", "2026-01-01T00:00:00Z")).toBe("2026-02-01T00:00:00Z");
  });
});

describe("momentCover", () => {
  it("single → small thumbnail, collab → first filled slot, missing → null", () => {
    expect(momentCover(moment("a", "lan", "2026-01-01T00:00:00Z", { thumbnailUrl: "/t", thumbSmallUrl: "/s" }))).toBe("/s");
    expect(momentCover(moment("b", "lan", "2026-01-01T00:00:00Z", { thumbnailUrl: "/t", missingMedia: true }))).toBeNull();
    const collab = moment("c", "lan", "2026-01-01T00:00:00Z", {
      template: "duo_square",
      slots: [{ ...slot("lan", false), slotIndex: 0 }, { ...slot("an"), slotIndex: 1, thumbnailUrl: "/slot1" }],
    });
    expect(momentCover(collab)).toBe("/slot1");
  });
});

describe("momentPictures", () => {
  it("single → [cover], trio → every slot in slot order, deleted slot → null", () => {
    expect(momentPictures(moment("a", "lan", "2026-01-01T00:00:00Z", { thumbSmallUrl: "/s" }))).toEqual(["/s"]);
    const trio = moment("t", "lan", "2026-01-01T00:00:00Z", {
      template: "trio_wide",
      slots: [
        { ...slot("c"), slotIndex: 2, mediaId: "m3", thumbnailUrl: "/3" },
        { ...slot("a"), slotIndex: 0, mediaId: "m1", thumbnailUrl: "/1" },
        { ...slot("b"), slotIndex: 1, mediaId: null, missing: true, thumbnailUrl: null },
      ],
    });
    expect(momentPictures(trio)).toEqual(["/1", null, "/3"]);
  });
});
