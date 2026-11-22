import { test } from "node:test";
import assert from "node:assert/strict";

import { parseUploadMeta } from "./media.schema.js";

test("parseUploadMeta: missing field = no meta", () => {
  assert.deepEqual(parseUploadMeta(undefined, 2), []);
  assert.deepEqual(parseUploadMeta("", 2), []);
});

test("parseUploadMeta: entries line up with files, null allowed", () => {
  const meta = parseUploadMeta(JSON.stringify([{ takenAt: "2019-07-01T10:00:00Z", favorite: true }, null]), 2);
  assert.equal(meta[0].takenAt, "2019-07-01T10:00:00Z");
  assert.equal(meta[0].favorite, true);
  assert.equal(meta[1], null);
});

test("parseUploadMeta: albumIds must be uuids", () => {
  const id = "0b7e4c1e-3f1a-4c55-9a51-2d0c8f1a7e10";
  assert.deepEqual(parseUploadMeta(JSON.stringify([{ albumIds: [id] }]), 1)[0].albumIds, [id]);
  assert.throws(() => parseUploadMeta(JSON.stringify([{ albumIds: ["1; DROP"] }]), 1), (err) => err.status === 400);
});

test("parseUploadMeta: rejects bad input with 400", () => {
  for (const raw of ["{", "{}", JSON.stringify([{}, {}, {}]), JSON.stringify([{ takenAt: "1850-01-01T00:00:00Z" }]),
    JSON.stringify([{ takenAt: "yesterday" }]), JSON.stringify([{ other: 1 }])]) {
    assert.throws(() => parseUploadMeta(raw, 2), (err) => err.status === 400 && err.code === "INVALID_META", raw);
  }
});
