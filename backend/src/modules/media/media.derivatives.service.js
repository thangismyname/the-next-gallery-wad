// Các bản resize của 1 ảnh/video — file gốc (có thể vài trăm MB) KHÔNG bao giờ
// được gửi ra để hiển thị:
//   small   200px cover  → grid
//   med     400px cover  → grid retina / placeholder lightbox
//   display ≤2048px giữ tỉ lệ → lightbox (ảnh) / poster (video), đầu vào AI
//   full    độ phân giải gốc, CHỈ cho HEIC (trình duyệt không hiển thị được
//           file gốc) — tạo khi người dùng bấm "Bản gốc"/phóng to
// Ảnh gốc chỉ được decode 1 LẦN (ra bản display); small/med cắt từ display.
// Video: poster = 1 khung hình do ffmpeg cắt, rồi đi chung đường với ảnh.
import { randomUUID } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import sharp from "sharp";
import { dbPool } from "../../config/db.js";
import { minioClient, BUCKET_NAME } from "../../config/minio.js";
import {
  extractVideoPoster,
  isHeifItem,
  openImageSource,
} from "./media.sources.js";

export const DISPLAY_MAX_EDGE = 2048;

const WEBP_HEADERS = { "Content-Type": "image/webp" };

// src = { input, options, autoRotate } (xem openImageSource).
async function deriveFrom(src) {
  const base = () => {
    const img = sharp(src.input, src.options);
    return src.autoRotate ? img.rotate() : img;
  };
  const { data: display, info } = await base()
    .resize(DISPLAY_MAX_EDGE, DISPLAY_MAX_EDGE, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  const meta = await sharp(src.input, src.options).metadata();
  // EXIF orientation 5–8 = ảnh xoay 90° → hoán đổi chiều gốc.
  const rotated = src.autoRotate && (meta.orientation ?? 1) >= 5;
  const width = (rotated ? meta.height : meta.width) || info.width;
  const height = (rotated ? meta.width : meta.height) || info.height;

  const cover = (size) =>
    sharp(display)
      .resize(size, size, { fit: "cover", position: "centre" })
      .webp({ quality: 80 })
      .toBuffer();
  const [med, small] = await Promise.all([cover(400), cover(200)]);

  return { display, med, small, width, height };
}

/**
 * Decode ảnh gốc trên đĩa (JPEG/PNG/WebP/AVIF/HEIC…) → { display, med, small,
 * width, height }. width/height là kích thước đúng chiều hiển thị.
 */
export async function buildImageDerivatives(filePath) {
  return deriveFrom(await openImageSource(filePath));
}

/**
 * Video (đường dẫn hoặc URL) → các bản resize của poster + { durationSeconds }.
 * width/height lấy theo video (đã tính xoay), fallback theo poster.
 */
export async function buildVideoDerivatives(input) {
  const v = await extractVideoPoster(input);
  const d = await deriveFrom({ input: v.poster, options: {}, autoRotate: false });
  return {
    ...d,
    width: v.width || d.width,
    height: v.height || d.height,
    durationSeconds: v.durationSeconds,
    takenAt: v.takenAt,
  };
}

/** Upload 1 bản WebP lên MinIO, trả object key. */
export async function putDerivative(userId, buffer) {
  const objectName = `${userId}/thumbs/${randomUUID()}.webp`;
  await minioClient.putObject(
    BUCKET_NAME,
    objectName,
    buffer,
    buffer.length,
    WEBP_HEADERS,
  );
  return objectName;
}

// ── Tạo các bản còn thiếu khi được gọi lần đầu (ảnh import/upload trước khi
//    có pipeline này — nhiều ảnh cũ không có cả thumbnail) ──

// Gộp các request trùng (grid + preload cùng lúc) về 1 lần generate.
const inFlight = new Map();
// Ảnh không decode được (hỏng / định dạng sharp không đọc, vd. HEIC) — nhớ
// tạm để không tải lại file gốc vài trăm MB ở mỗi request.
const failedAt = new Map();
const FAILED_RETRY_MS = 10 * 60_000;
// Giới hạn số ảnh gốc được decode đồng thời — tránh 1 loạt ảnh 200MB làm
// server hết CPU/RAM.
const MAX_CONCURRENT = 2;
let running = 0;
const waiting = [];

async function withSlot(fn) {
  if (running >= MAX_CONCURRENT) {
    await new Promise((resolve) => waiting.push(resolve));
  }
  running += 1;
  try {
    return await fn();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

const currentKeys = (item) => ({
  display: item.display_object ?? null,
  med: item.thumbnail_object ?? null,
  small: item.thumbnail_small_object ?? null,
});

// Tải file gốc ra đĩa tạm thay vì buffer RAM (file có thể vài trăm MB).
async function withOriginalOnDisk(item, fn) {
  const bucket = item.minio_bucket || BUCKET_NAME;
  const tmpPath = path.join(os.tmpdir(), `tng-derive-${randomUUID()}`);
  try {
    await minioClient.fGetObject(bucket, item.minio_object, tmpPath);
    return await fn(tmpPath);
  } finally {
    await fs.rm(tmpPath, { force: true });
  }
}

async function generateMissing(item) {
  const bucket = item.minio_bucket || BUCKET_NAME;
  const keys = currentKeys(item);
  const d =
    item.media_type === "video"
      ? // ffmpeg đọc thẳng qua presigned URL (HTTP Range) — chỉ tải đoạn
        // quanh khung cần cắt, không tải cả video.
        await buildVideoDerivatives(
          await minioClient.presignedGetObject(bucket, item.minio_object, 600),
        )
      : await withOriginalOnDisk(item, buildImageDerivatives);
  // Chỉ upload bản còn thiếu — bản đã có giữ nguyên (không để object mồ côi).
  const [display, med, small] = await Promise.all(
    ["display", "med", "small"].map((k) =>
      keys[k] ? keys[k] : putDerivative(item.user_id, d[k]),
    ),
  );
  // Không bump updated_at — ETag của file gốc/thumbnail giữ nguyên.
  await dbPool.query(
    `UPDATE media
     SET display_object = COALESCE(display_object, $2),
         thumbnail_object = COALESCE(thumbnail_object, $3),
         thumbnail_small_object = COALESCE(thumbnail_small_object, $4),
         width = COALESCE(width, $5),
         height = COALESCE(height, $6),
         duration_seconds = COALESCE(duration_seconds, $7)
     WHERE id = $1`,
    [item.id, display, med, small, d.width, d.height, d.durationSeconds ?? null],
  );
  return { display, med, small };
}

/**
 * Object key của 3 bản (display/med/small) — tạo + lưu bản còn thiếu.
 * Ảnh + video; file không decode được → các key thiếu vẫn là null.
 * `item` cần: id, user_id, media_type, minio_object, minio_bucket,
 * display_object, thumbnail_object, thumbnail_small_object.
 */
export async function ensureDerivatives(item) {
  const keys = currentKeys(item);
  if (keys.display && keys.med && keys.small) return keys;
  if (!["photo", "video"].includes(item.media_type) || !item.minio_object) {
    return keys;
  }

  const id = String(item.id);
  if (Date.now() - (failedAt.get(id) ?? 0) < FAILED_RETRY_MS) return keys;

  if (!inFlight.has(id)) {
    inFlight.set(
      id,
      withSlot(() => generateMissing(item))
        .catch((err) => {
          console.error(`Lỗi tạo thumbnail cho media ${id}:`, err.message);
          failedAt.set(id, Date.now());
          return keys;
        })
        .finally(() => inFlight.delete(id)),
    );
  }
  return inFlight.get(id);
}

// WebP giới hạn 16383px mỗi cạnh — đủ cho mọi ảnh điện thoại/máy ảnh.
const FULL_MAX_EDGE = 16383;

async function generateFull(item) {
  const buffer = await withOriginalOnDisk(item, async (tmpPath) => {
    const src = await openImageSource(tmpPath);
    const img = sharp(src.input, src.options);
    return (src.autoRotate ? img.rotate() : img)
      .resize(FULL_MAX_EDGE, FULL_MAX_EDGE, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 90 })
      .toBuffer();
  });
  const objectName = await putDerivative(item.user_id, buffer);
  await dbPool.query(
    `UPDATE media SET full_object = COALESCE(full_object, $2) WHERE id = $1`,
    [item.id, objectName],
  );
  return objectName;
}

/**
 * Bản "full" (WebP độ phân giải gốc) — chỉ cho ảnh trình duyệt không hiển thị
 * được (HEIC); tạo khi được gọi lần đầu. Ảnh khác → null (dùng thẳng file gốc).
 */
export async function ensureFullObject(item) {
  if (item.full_object) return item.full_object;
  if (item.media_type !== "photo" || !isHeifItem(item)) return null;

  const id = `full:${item.id}`;
  if (Date.now() - (failedAt.get(id) ?? 0) < FAILED_RETRY_MS) return null;
  if (!inFlight.has(id)) {
    inFlight.set(
      id,
      withSlot(() => generateFull(item))
        .catch((err) => {
          console.error(`Lỗi tạo bản full cho media ${item.id}:`, err.message);
          failedAt.set(id, Date.now());
          return null;
        })
        .finally(() => inFlight.delete(id)),
    );
  }
  return inFlight.get(id);
}

/**
 * Buffer ảnh đưa cho AI khi backfill: bản display (giữ tỉ lệ, ≤2048px) — tạo
 * nếu chưa có; chỉ khi không tạo được mới đọc file gốc.
 */
export async function readAiSourceBuffer(item) {
  const bucket = item.minio_bucket || BUCKET_NAME;
  const { display } = await ensureDerivatives(item);
  const stream = await minioClient.getObject(bucket, display || item.minio_object);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}
