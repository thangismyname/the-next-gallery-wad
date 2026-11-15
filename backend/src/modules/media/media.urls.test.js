// URL ảnh có chữ ký (HMAC + hạn dùng): stream endpoint chỉ mở cho URL do backend ký.
import { test } from "node:test";
import assert from "node:assert/strict";

// media.urls.js đọc secret lúc import → đặt trước khi import (mỗi file test chạy trong process riêng).
process.env.MEDIA_URL_SECRET = "test-secret-only-for-unit-tests-0123456789";
const { signParams, verifyParams } = await import("./media.urls.js");
const { mediaThumbUrl, mediaFileUrl } = await import("./media.mapper.js");

const ID = "11111111-2222-3333-4444-555555555555";
const parse = (qs) => Object.fromEntries(new URLSearchParams(qs));

test("URL vừa ký thì hợp lệ, hạn dùng trong tương lai", () => {
  const q = parse(signParams(ID, "med"));
  const res = verifyParams(ID, "med", q);
  assert.equal(res.ok, true);
  assert.ok(res.exp > Date.now() / 1000);
  assert.equal(res.scope, "");
});

test("sửa bất kỳ phần nào → bị từ chối", () => {
  const q = parse(signParams(ID, "med"));
  assert.equal(verifyParams("another-id", "med", q).ok, false, "đổi ảnh");
  assert.equal(verifyParams(ID, "file", q).ok, false, "đổi thumbnail → file gốc");
  assert.equal(verifyParams(ID, "med", { ...q, exp: String(Number(q.exp) + 3600) }).ok, false, "kéo dài hạn");
  assert.equal(verifyParams(ID, "med", { ...q, sig: "x".repeat(32) }).ok, false, "chữ ký giả");
  assert.equal(verifyParams(ID, "med", { exp: q.exp }).ok, false, "thiếu chữ ký");
  assert.equal(verifyParams(ID, "med", { ...q, sig: "é".repeat(32) }).ok, false, "ký tự nhiều byte không làm crash");
});

test("URL hết hạn bị từ chối", () => {
  const q = parse(signParams(ID, "med"));
  assert.equal(verifyParams(ID, "med", { ...q, exp: "1000" }).ok, false);
});

test("URL của link công khai mang scope; bỏ / đổi scope → không hợp lệ", () => {
  const q = parse(signParams(ID, "small", "link-123"));
  assert.equal(q.l, "link-123");
  assert.deepEqual(verifyParams(ID, "small", q).scope, "link-123");
  const { l: _dropped, ...noScope } = q;
  assert.equal(verifyParams(ID, "small", noScope).ok, false);
  assert.equal(verifyParams(ID, "small", { ...q, l: "link-456" }).ok, false);
});

test("URL trong API (mapper) đều có chữ ký đúng loại", () => {
  const thumb = new URL(mediaThumbUrl(ID, "small"), "http://x");
  assert.match(thumb.pathname, new RegExp(`/media/${ID}/thumbnail$`));
  assert.equal(thumb.searchParams.get("size"), "small");
  assert.equal(verifyParams(ID, "small", Object.fromEntries(thumb.searchParams)).ok, true);
  const file = new URL(mediaFileUrl(ID), "http://x");
  assert.equal(verifyParams(ID, "file", Object.fromEntries(file.searchParams)).ok, true);
});
