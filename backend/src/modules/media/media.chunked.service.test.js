import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";

process.env.CHUNKED_UPLOAD_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "tng-chunk-test-"));
const { appendChunk, startChunkedUpload, uploadIdFor } = await import("./media.chunked.service.js");

const file = { name: "big.mov", size: 10, mimeType: "video/quicktime", fingerprint: "big.mov:10:1" };

test("chunks append in order, resume from the server offset, reject wrong offset / other user", async () => {
  const s = await startChunkedUpload("u1", file);
  assert.equal(s.uploadId, uploadIdFor("u1", file.fingerprint));
  assert.equal(s.offset, 0);
  assert.deepEqual(await appendChunk("u1", s.uploadId, 0, Buffer.from("hello")), { offset: 5 });

  // Same file again (network drop / reload) → same session, continues at 5.
  assert.equal((await startChunkedUpload("u1", file)).offset, 5);

  await assert.rejects(appendChunk("u1", s.uploadId, 0, Buffer.from("x")), (e) => e.status === 409 && e.details.offset === 5);
  await assert.rejects(appendChunk("u1", s.uploadId, 5, Buffer.alloc(6)), (e) => e.status === 400);
  await assert.rejects(appendChunk("u2", s.uploadId, 5, Buffer.from("x")), (e) => e.status === 404);
  assert.deepEqual(await appendChunk("u1", s.uploadId, 5, Buffer.from("world")), { offset: 10 });

  // Different size under the same fingerprint → fresh session.
  assert.equal((await startChunkedUpload("u1", { ...file, size: 20 })).offset, 0);
  await assert.rejects(startChunkedUpload("u1", { ...file, name: "a.txt", mimeType: "text/plain" }), (e) => e.status === 400);
});
