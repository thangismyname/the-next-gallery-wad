import { describe, expect, it } from "vitest";
import { buildScopes, normalize, parseScopedQuery, suggestScopes } from "./searchScope";

const scopes = buildScopes({
  favoritesName: "Yêu thích",
  editedName: "Ảnh đã chỉnh sửa",
  labels: [
    { id: "l1", name: "Cần in", color: "rose" },
    { id: "l2", name: "Du lịch", color: "sky", aliases: ["travel", "旅行"] },
  ],
  albums: [{ id: "a1", name: "Đà Lạt 2026" }],
});

describe("normalize", () => {
  it("strips Vietnamese accents and lowercases", () => {
    expect(normalize("  Đà Lạt Yêu Thích ")).toBe("da lat yeu thich");
  });
});

describe("suggestScopes", () => {
  it("matches names at the start of any word, accent-insensitive", () => {
    expect(suggestScopes("lat", scopes).map((s) => s.key)).toEqual(["album:a1"]);
    expect(suggestScopes("yeu", scopes).map((s) => s.key)).toEqual(["favorites"]);
  });

  it("matches suggested-label aliases in other languages, CJK from 1 char", () => {
    expect(suggestScopes("旅", scopes).map((s) => s.key)).toEqual(["label:l2"]);
  });

  it("matches label colours after names", () => {
    expect(suggestScopes("đỏ", scopes).map((s) => s.key)).toEqual(["label:l1"]);
  });

  it("needs 2 latin characters", () => {
    expect(suggestScopes("y", scopes)).toEqual([]);
  });
});

describe("parseScopedQuery", () => {
  it("splits the favorite.dog shortcut", () => {
    const parsed = parseScopedQuery("fav.chó trên biển", scopes);
    expect(parsed?.scope.key).toBe("favorites");
    expect(parsed?.rest).toBe("chó trên biển");
  });

  it("ignores disabled scopes and unknown prefixes", () => {
    expect(parseScopedQuery("edited.dog", scopes)).toBeNull();
    expect(parseScopedQuery("v1.2 release", scopes)).toBeNull();
  });
});
