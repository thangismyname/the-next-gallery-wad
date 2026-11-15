// Chấm điểm hybrid search (CLIP + tag + YOLO + nhãn) — hàm thuần, không cần DB / ai-service.
// Cùng công thức với ai-service/bench/search_eval.py (test parity ở phía Python).
import { test } from "node:test";
import assert from "node:assert/strict";
import { PARAMS, clipProbabilities, countFactor, scoreRow } from "./hybrid.search.service.js";
import { applyQueryTemplate } from "./embedding.service.js";
import { parseQuery } from "./search.query.js";

const row = ({ clip = 0.5, tags = {}, objects = {} } = {}) => ({ clip, tags, objects });

test("countFactor: đúng số → 1, thừa → 0.5, thiếu → tỉ lệ, không có → 0", () => {
  assert.equal(countFactor(2, 2), 1);
  assert.equal(countFactor(5, null), 1); // câu không nói số lượng
  assert.equal(countFactor(3, 2), 0.5);
  assert.equal(countFactor(1, 2), 0.25);
  assert.equal(countFactor(0, 2), 0);
});

test("AND: ảnh thiếu 1 ý (có chó, không có biển) xếp sau ảnh đủ cả hai", () => {
  const q = parseQuery("2 con chó trên bãi biển");
  const both = scoreRow(row({ tags: { beach: 0.9 }, objects: { dog: { n: 2, conf: 0.9 } } }), q);
  const dogOnly = scoreRow(row({ objects: { dog: { n: 2, conf: 0.9 } } }), q);
  const beachOnly = scoreRow(row({ tags: { beach: 0.9 } }), q);
  assert.ok(both.score > 0.85, `đủ ý phải cao, nhận ${both.score}`);
  assert.ok(both.score > dogOnly.score && both.score > beachOnly.score);
  assert.ok(dogOnly.score < PARAMS.floor * 10, "thiếu hẳn 1 ý → gần 0 (trung bình nhân)");
});

test("sai số lượng bị trừ điểm", () => {
  const q = parseQuery("two dogs");
  const exact = scoreRow(row({ objects: { dog: { n: 2, conf: 0.9 } } }), q).score;
  const more = scoreRow(row({ objects: { dog: { n: 4, conf: 0.9 } } }), q).score;
  const fewer = scoreRow(row({ objects: { dog: { n: 1, conf: 0.9 } } }), q).score;
  assert.ok(exact > more && more > fewer);
});

test("câu hiểu hết → CLIP chỉ phân định hoà; câu không hiểu → chỉ CLIP", () => {
  const q = parseQuery("two dogs");
  const a = scoreRow(row({ clip: 0.9, objects: { dog: { n: 2, conf: 0.8 } } }), q);
  const b = scoreRow(row({ clip: 0.1, objects: { dog: { n: 2, conf: 0.8 } } }), q);
  assert.ok(a.score > b.score && a.score - b.score < 0.01);
  const free = scoreRow(row({ clip: 0.73 }), parseQuery("a photo of my grandma"));
  assert.ok(Math.abs(free.score - 0.73) < 1e-9);
  assert.deepEqual(Object.keys(free.parts), ["clip"]);
});

test("nhãn chi tiết link với vật thể là bằng chứng thay thế (khi YOLO không thấy)", () => {
  const q = parseQuery("chó");
  const yolo = scoreRow(row({ objects: { dog: { n: 1, conf: 0.8 } } }), q).score;
  const labelOnly = scoreRow(row({ tags: { "oi.dog": 0.8 } }), q).score;
  const none = scoreRow(row(), q).score;
  assert.ok(Math.abs(yolo - labelOnly) < 1e-9);
  assert.ok(labelOnly > none);
});

test("clipProbabilities: ít ảnh → sigmoid; nhiều ảnh → z-score, ảnh nổi bật hẳn mới > 0.5", () => {
  const few = clipProbabilities([0, 0.1], 10);
  assert.ok(Math.abs(few[0] - 0.5) < 1e-9 && few[1] > 0.5);
  const margins = Array.from({ length: 99 }, () => 0.01).concat([0.5]);
  const p = clipProbabilities(margins, 100);
  assert.ok(p[99] > 0.5, "ảnh vượt hẳn phần còn lại");
  assert.ok(p[0] < 0.05, "ảnh bình thường");
});

test("applyQueryTemplate: câu ≤ 3 từ được bọc 'a photo of a …', câu dài giữ nguyên", () => {
  assert.equal(applyQueryTemplate("dog"), "a photo of a dog");
  assert.equal(applyQueryTemplate("dog on beach."), "a photo of a dog on beach");
  assert.equal(applyQueryTemplate("a dog running on the beach"), "a dog running on the beach");
});
