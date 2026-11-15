// Phân loại file upload + Range header (tua video) — hàm thuần.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyUpload } from "./media.sources.js";
import { parseRange } from "./media.stream.service.js";

const file = (originalname, mimetype) => ({ originalname, mimetype });

test("classifyUpload: theo MIME", () => {
  assert.deepEqual(classifyUpload(file("a.jpg", "image/jpeg")), { mediaType: "photo", mimeType: "image/jpeg" });
  assert.equal(classifyUpload(file("a.mp4", "video/mp4")).mediaType, "video");
});

test("classifyUpload: HEIC / MOV từ Windows/Android (MIME octet-stream) nhận theo đuôi", () => {
  assert.deepEqual(classifyUpload(file("IMG_1.HEIC", "application/octet-stream")), {
    mediaType: "photo",
    mimeType: "image/heic",
  });
  assert.deepEqual(classifyUpload(file("clip.MOV", "application/octet-stream")), {
    mediaType: "video",
    mimeType: "video/quicktime",
  });
});

test("classifyUpload: từ chối SVG / file không phải ảnh", () => {
  assert.equal(classifyUpload(file("logo.svg", "image/svg+xml")).mediaType, null);
  assert.equal(classifyUpload(file("notes.pdf", "application/pdf")).mediaType, null);
  assert.equal(classifyUpload(file("noext", "")).mediaType, null);
});

test("parseRange: các dạng Range hợp lệ", () => {
  assert.deepEqual(parseRange("bytes=0-99", 1000), { start: 0, end: 99 });
  assert.deepEqual(parseRange("bytes=900-", 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange("bytes=-100", 1000), { start: 900, end: 999 }, "100 byte cuối");
  assert.deepEqual(parseRange("bytes=500-5000", 1000), { start: 500, end: 999 }, "kẹp về cuối file");
});

test("parseRange: ngoài file → false (416), sai cú pháp → null (trả cả file)", () => {
  assert.equal(parseRange("bytes=1000-", 1000), false);
  assert.equal(parseRange("bytes=-0", 1000), false);
  assert.equal(parseRange("bytes=50-10", 1000), null);
  assert.equal(parseRange("bytes=-", 1000), null);
  assert.equal(parseRange("items=0-1", 1000), null);
});
