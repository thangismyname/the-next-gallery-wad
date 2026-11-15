import { test } from "node:test";
import assert from "node:assert/strict";

import { cropBox, parseAvatarUrl, parseCrop } from "./profile.avatar.js";

const ID = "0b9d7c2e-8f4a-4c51-9e2b-3a6f1d0c7e45";

test("parseAvatarUrl: relative / absolute, with and without crop", () => {
  assert.deepEqual(parseAvatarUrl(`/api/profile/avatar/${ID}`), { mediaId: ID, crop: null });
  assert.deepEqual(parseAvatarUrl(`http://192.168.1.30:3000/api/profile/avatar/${ID}?c=0.1,0.2,0.5,0.4`), {
    mediaId: ID,
    crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.4 },
  });
});

test("parseAvatarUrl: not an avatar URL → null", () => {
  assert.equal(parseAvatarUrl("https://avatars.githubusercontent.com/u/1"), null);
  assert.equal(parseAvatarUrl(`/api/profile/avatar/${ID}/extra`), null);
  assert.equal(parseAvatarUrl(null), null);
});

test("parseCrop rejects out-of-range or malformed values", () => {
  assert.equal(parseCrop("0.5,0.5,0.6,0.2"), null); // x + w > 1
  assert.equal(parseCrop("-0.1,0,0.5,0.5"), null);
  assert.equal(parseCrop("0,0,0,0.5"), null);
  assert.equal(parseCrop("a,b,c,d"), null);
  assert.equal(parseCrop("0,0,1"), null);
  assert.deepEqual(parseCrop("0,0,1,1"), { x: 0, y: 0, w: 1, h: 1 });
});

test("cropBox stays inside the image", () => {
  assert.deepEqual(cropBox({ x: 0.25, y: 0, w: 0.5, h: 1 }, 2000, 1000), { left: 500, top: 0, width: 1000, height: 1000 });
  const box = cropBox({ x: 0.9, y: 0.9, w: 0.1001, h: 0.1001 }, 1000, 1000);
  assert.ok(box.left + box.width <= 1000 && box.top + box.height <= 1000);
});
