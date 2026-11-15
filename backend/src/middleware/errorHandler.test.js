import test from "node:test";
import assert from "node:assert/strict";
import { errorHandler, httpError } from "./errorHandler.js";

function send(err) {
  const res = { status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  errorHandler(err, {}, res, () => {});
  return res;
}

test("httpError(status, code, message): 4xx trả code + message", () => {
  const res = send(httpError(404, "ALBUM_NOT_FOUND", "Không tìm thấy album"));
  assert.equal(res.code, 404);
  assert.deepEqual(res.body.error, { code: "ALBUM_NOT_FOUND", message: "Không tìm thấy album" });
});

test("httpError không có code → BAD_REQUEST; lỗi 5xx giấu chi tiết", () => {
  assert.equal(send(httpError(400, null, "Sai")).body.error.code, "BAD_REQUEST");
  const res = send(new Error("SELECT * FROM secret"));
  assert.equal(res.code, 500);
  assert.equal(res.body.error.code, "INTERNAL_ERROR");
  assert.doesNotMatch(res.body.error.message, /SELECT/);
});
