import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDateQuery } from "./search.date.js";

const pick = (q) => {
  const r = parseDateQuery(q);
  return r && { year: r.year, month: r.month, day: r.day, rest: r.rest };
};
const d = (year, month, day, rest = "") => ({ year, month, day, rest });

test("year", () => {
  assert.deepEqual(pick("2026"), d(2026, undefined, undefined));
  assert.deepEqual(pick("năm 2026"), d(2026));
  assert.deepEqual(pick("2026年"), d(2026));
  assert.deepEqual(pick("dog 2025"), d(2025, undefined, undefined, "dog"));
});

test("month of a year", () => {
  for (const q of ["tháng 3 2026", "tháng 3/2026", "tháng 3 năm 2026", "03/2026", "2026-03", "March 2026", "mar 2026", "2026年3月"]) {
    assert.deepEqual(pick(q), d(2026, 3), q);
  }
});

test("month of every year", () => {
  for (const q of ["tháng 3", "March", "3月"]) assert.deepEqual(pick(q), d(undefined, 3), q);
  assert.equal(parseDateQuery("may"), null); // "may" trơn = chữ thường
  assert.deepEqual(pick("may 2024"), d(2024, 5));
});

test("full date", () => {
  for (const q of [
    "19/11/2026", "19-11-2026", "19.11.2026", "2026-11-19", "11/19/2026", "ngày 19 tháng 11 năm 2026",
    "19 tháng 11 2026", "November 19, 2026", "nov 19th 2026", "19 Nov 2026", "2026年11月19日", "2026年11月19号",
  ]) {
    assert.deepEqual(pick(q), d(2026, 11, 19), q);
  }
});

test("day of every year", () => {
  for (const q of ["19/11", "19 tháng 11", "ngày 19 tháng 11", "Nov 19", "11月19日", "11月19号"]) {
    assert.deepEqual(pick(q), d(undefined, 11, 19), q);
  }
  assert.deepEqual(pick("3/4"), d(undefined, 4, 3)); // VN: ngày/tháng
});

test("keeps the rest of the query and drops connectors", () => {
  assert.deepEqual(pick("chó trên bãi biển tháng 7 2025"), d(2025, 7, undefined, "chó trên bãi biển"));
  assert.deepEqual(pick("beach in March 2026"), d(2026, 3, undefined, "beach"));
  assert.deepEqual(pick("ảnh vào ngày 2/9"), d(undefined, 9, 2, "ảnh"));
  assert.deepEqual(pick("犬 2026年5月"), d(2026, 5, undefined, "犬"));
});

test("not a date", () => {
  for (const q of ["2 con chó", "two dogs", "犬が2匹", "10:30", "32/13", "1234", "tháng", "30/2/2026"]) {
    assert.equal(parseDateQuery(q), null, q);
  }
});
