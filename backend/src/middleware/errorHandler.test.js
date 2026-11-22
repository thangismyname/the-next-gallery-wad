import { test } from "node:test";
import assert from "node:assert/strict";
import multer from "multer";
import { errorHandler, httpError } from "./errorHandler.js";

const run = (err) => {
  const res = { status(s) { this.code = s; return this; }, json(b) { this.body = b; return this; } };
  errorHandler(err, {}, res, () => {});
  return res;
};

test("multer errors are 4xx, unknown errors stay a generic 500", () => {
  assert.equal(run(new multer.MulterError("LIMIT_FILE_SIZE", "media")).code, 413);
  assert.equal(run(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "x")).code, 400);
  assert.equal(run(httpError(400, "UNSUPPORTED_MEDIA", "nope")).body.error.code, "UNSUPPORTED_MEDIA");
  const r = run(new Error("secret SQL"));
  assert.equal(r.code, 500);
  assert.equal(r.body.error.code, "INTERNAL_ERROR");
});
