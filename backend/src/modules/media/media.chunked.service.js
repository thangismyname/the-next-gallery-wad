// Upload chia nhỏ, tiếp tục được (resumable) — cho file lớn hơn CHUNKED_THRESHOLD (ảnh hay video
// đều được), để giới hạn 1 request (multer) có giảm cũng không chặn file lớn.
// Luồng: POST /uploads (tạo / tiếp tục) → POST /uploads/:id/chunk?offset=N (ghi nối, tuần tự)
// → POST /uploads/:id/complete { meta } (chạy đúng uploadMedia như upload thường).
// Trạng thái = 2 file trên đĩa: <id>.bin (dữ liệu đã nhận, offset = kích thước) + <id>.json.
// id = hash(user + fingerprint client) → gửi lại cùng file (rớt mạng, tải lại trang) tiếp đúng chỗ dở.
import { createHash } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { httpError } from "../../middleware/errorHandler.js";
import { classifyUpload } from "./media.sources.js";
import { uploadMedia } from "./media.upload.service.js";

/** Giữ khớp `@tng/shared` `import/chunked.ts` (đổi cả 2). */
export const CHUNK_SIZE = 8 * 1024 * 1024;
export const MAX_CHUNK_BYTES = 16 * 1024 * 1024;
export const MAX_RESUMABLE_BYTES = 8 * 1024 ** 3;
const STALE_MS = 24 * 3600 * 1000;

const dir = () => process.env.CHUNKED_UPLOAD_DIR || path.join(os.tmpdir(), "tng-chunked");
const binPath = (id) => path.join(dir(), `${id}.bin`);
const infoPath = (id) => path.join(dir(), `${id}.json`);

export const uploadIdFor = (userId, fingerprint) =>
  createHash("sha256").update(`${userId}\n${fingerprint}`).digest("hex").slice(0, 32);

const sizeOf = (p) => fs.stat(p).then((s) => s.size, () => 0);

// 1 thao tác / upload tại một thời điểm (2 request cùng offset không được ghi đè nhau).
const locks = new Map();
function withLock(id, fn) {
  const run = (locks.get(id) ?? Promise.resolve()).then(fn, fn);
  const tail = run.catch(() => {});
  locks.set(id, tail);
  tail.then(() => locks.get(id) === tail && locks.delete(id));
  return run;
}

async function readInfo(userId, id) {
  const info = await fs.readFile(infoPath(id), "utf8").then(JSON.parse, () => null);
  // Không có / của người khác → 404 như nhau (không lộ upload của ai).
  if (!info || info.userId !== userId) throw httpError(404, "UPLOAD_NOT_FOUND", "Không tìm thấy phiên upload");
  return info;
}

/** shortcut: dọn phiên bỏ dở > 24 h mỗi lần tạo phiên mới — đủ cho 1 instance, chuyển sang job nếu scale. */
async function sweepStale() {
  const names = await fs.readdir(dir()).catch(() => []);
  const now = Date.now();
  await Promise.all(
    names.map(async (n) => {
      const p = path.join(dir(), n);
      const st = await fs.stat(p).catch(() => null);
      if (st && now - st.mtimeMs > STALE_MS) await fs.rm(p, { force: true });
    }),
  );
}

/** Tạo phiên mới hoặc trả phiên đang dở của cùng file → { uploadId, offset, chunkSize }. */
export async function startChunkedUpload(userId, { name, size, mimeType, fingerprint }) {
  if (!classifyUpload({ originalname: name, mimetype: mimeType }).mediaType) {
    throw httpError(400, "UNSUPPORTED_MEDIA", "Chỉ chấp nhận file ảnh hoặc video");
  }
  await fs.mkdir(dir(), { recursive: true });
  await sweepStale();
  const id = uploadIdFor(userId, fingerprint);
  return withLock(id, async () => {
    const info = await fs.readFile(infoPath(id), "utf8").then(JSON.parse, () => null);
    const same = info && info.userId === userId && info.size === size && info.name === name;
    if (!same) {
      await fs.writeFile(binPath(id), "");
      await fs.writeFile(infoPath(id), JSON.stringify({ userId, name, size, mimeType }));
    }
    return { uploadId: id, offset: await sizeOf(binPath(id)), chunkSize: CHUNK_SIZE };
  });
}

/** Ghi nối 1 phần ở đúng `offset` → { offset } mới. Sai offset → 409 kèm offset server đang có. */
export async function appendChunk(userId, id, offset, buffer) {
  return withLock(id, async () => {
    const info = await readInfo(userId, id);
    const have = await sizeOf(binPath(id));
    if (offset !== have) {
      throw Object.assign(httpError(409, "OFFSET_MISMATCH", "Sai vị trí phần upload"), { details: { offset: have } });
    }
    if (!buffer?.length || have + buffer.length > info.size) {
      throw httpError(400, "INVALID_CHUNK", "Phần upload rỗng hoặc vượt kích thước file");
    }
    await fs.appendFile(binPath(id), buffer);
    // Chạm vào .json để phiên đang chạy không bị dọn như phiên bỏ dở.
    const now = new Date();
    await fs.utimes(infoPath(id), now, now);
    return { offset: have + buffer.length };
  });
}

/** Đủ byte → xử lý như upload thường (hash trùng, thumbnail, AI…) → 1 media item; xoá file tạm. */
export async function completeChunkedUpload(userId, id, meta) {
  return withLock(id, async () => {
    const info = await readInfo(userId, id);
    const have = await sizeOf(binPath(id));
    if (have !== info.size) {
      throw Object.assign(httpError(409, "UPLOAD_INCOMPLETE", "Upload chưa đủ dữ liệu"), { details: { offset: have } });
    }
    const file = { path: binPath(id), originalname: info.name, mimetype: info.mimeType, size: have };
    try {
      const [item] = await uploadMedia(userId, [file], [meta ?? null]);
      await cleanup(id);
      return item;
    } catch (err) {
      // File hỏng (4xx, vd video không đọc được) → bỏ luôn; lỗi server → giữ để thử complete lại.
      if (err.status >= 400 && err.status < 500) await cleanup(id);
      throw err;
    }
  });
}

const cleanup = (id) => Promise.all([fs.rm(binPath(id), { force: true }), fs.rm(infoPath(id), { force: true })]);
