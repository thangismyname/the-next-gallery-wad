// asyncHandler / respond trên 1 app Express thật (cổng ngẫu nhiên, không cần DB).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { asyncHandler, respond } from "./asyncHandler.js";

let server;
let base;

before(async () => {
  const app = express();
  app.get("/data", respond(async () => ({ n: 1 })));
  app.get("/sync", respond(() => [1, 2]));
  app.get("/empty", respond(async () => undefined));
  app.get("/custom", respond(async (_req, res) => res.status(201).json({ ok: true })));
  app.get("/boom", respond(async () => {
    const err = new Error("not found");
    err.status = 404;
    throw err;
  }));
  app.get("/throw-sync", asyncHandler(() => {
    throw new Error("sync");
  }));
  app.get("/raw", asyncHandler(async (_req, res) => res.status(202).send("raw")));
  // errorHandler rút gọn: lỗi phải tới đây thay vì treo request / crash process
  app.use((err, _req, res, _next) => res.status(err.status ?? 500).json({ success: false, message: err.message }));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

const get = async (path) => {
  const r = await fetch(base + path);
  return { status: r.status, body: r.headers.get("content-type")?.includes("json") ? await r.json() : await r.text() };
};

test("respond: trả { success: true, data } (async lẫn sync)", async () => {
  assert.deepEqual(await get("/data"), { status: 200, body: { success: true, data: { n: 1 } } });
  assert.deepEqual(await get("/sync"), { status: 200, body: { success: true, data: [1, 2] } });
  assert.deepEqual((await get("/empty")).body, { success: true, data: null });
});

test("respond: handler tự gửi response → không gửi thêm lần nữa", async () => {
  assert.deepEqual(await get("/custom"), { status: 201, body: { ok: true } });
});

test("lỗi (async lẫn throw đồng bộ) → errorHandler với đúng status", async () => {
  assert.deepEqual(await get("/boom"), { status: 404, body: { success: false, message: "not found" } });
  assert.deepEqual(await get("/throw-sync"), { status: 500, body: { success: false, message: "sync" } });
});

test("asyncHandler: handler tự trả response bất kỳ", async () => {
  assert.deepEqual(await get("/raw"), { status: 202, body: "raw" });
});
