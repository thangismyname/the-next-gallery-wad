// Bộ phân tích câu tìm kiếm Spotlight (vi / en / ja) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeQuery, parseQuery } from "./search.query.js";

const objects = (q) => parseQuery(q).objects;

test("cùng 1 ý ở 3 ngôn ngữ → cùng vật thể + số lượng", () => {
  const vi = parseQuery("2 con chó trên bãi biển");
  const en = parseQuery("two dogs on a beach");
  assert.deepEqual(vi.objects, [{ cls: "dog", count: 2 }]);
  assert.deepEqual(en.objects, vi.objects);
  assert.deepEqual(vi.tags, ["beach"]);
  assert.deepEqual(en.tags, ["beach"]);
  assert.deepEqual(objects("犬が2匹"), [{ cls: "dog", count: 2 }]);
});

test("không nói số lượng → count = null", () => {
  assert.deepEqual(objects("chó"), [{ cls: "dog", count: null }]);
  assert.deepEqual(objects("dog"), [{ cls: "dog", count: null }]);
});

test("nhãn chi tiết: nhãn trùng tag / vật thể được link, nhãn riêng thì không", () => {
  const q = parseQuery("2 con chó trên bãi biển");
  assert.deepEqual(q.labels, [
    { id: "oi.beach", link: { kind: "tag", id: "beach" } },
    { id: "oi.dog", link: { kind: "object", id: "dog" } },
  ]);
  // "thác nước" không phải tag hay lớp COCO → nhãn đứng riêng
  assert.deepEqual(parseQuery("thác nước").labels, [{ id: "oi.waterfall", link: null }]);
  assert.deepEqual(parseQuery("two dogs", { labels: false }).labels ?? [], []);
});

test("coverage = phần câu hiểu được (0 → chỉ CLIP)", () => {
  assert.equal(parseQuery("two dogs on a beach").coverage, 1);
  const unknown = parseQuery("a photo of my grandma");
  assert.equal(unknown.coverage, 0);
  assert.deepEqual([unknown.tags, unknown.objects, unknown.labels], [[], [], []]);
});

test("chuẩn hoá: chữ thường, gộp khoảng trắng, giữ dấu tiếng Việt", () => {
  assert.equal(normalizeQuery("  Bãi Biển  ĐẸP "), "bãi biển đẹp");
  assert.equal(parseQuery("Chó").text, "chó");
});
