// Basic edit, không phá huỷ: trình duyệt render ảnh đã chỉnh (WebGL) từ bản
// display GỐC rồi gửi lên kèm công thức. Server cắt lại display/med/small từ
// ảnh đó (không tin kích thước client gửi) và lưu vào media_edits — file gốc +
// bản resize gốc trên `media` không đổi. Xoá row = về ảnh gốc.
import { dbPool } from "../../config/db.js";
import { BUCKET_NAME, minioClient } from "../../config/minio.js";
import { httpError } from "../../middleware/errorHandler.js";
import { buildImageDerivatives } from "./media.derivatives.service.js";
import { mediaThumbUrl } from "./media.mapper.js";
import { logger } from "../../lib/logger.js";

const WEBP = { "Content-Type": "image/webp" };
const EDIT_KEYS = ["display_object", "thumbnail_object", "thumbnail_small_object"];

/** Ảnh của chính user, chưa vào thùng rác (chỉ ảnh — video không chỉnh). */
async function ownPhoto(userId, mediaId) {
  const { rows } = await dbPool.query(
    `SELECT m.id, m.minio_bucket, e.recipe, e.updated_at,
            e.display_object, e.thumbnail_object, e.thumbnail_small_object
     FROM media m LEFT JOIN media_edits e ON e.media_id = m.id
     WHERE m.id = $1 AND m.user_id = $2 AND m.deleted_at IS NULL AND m.media_type = 'photo'`,
    [mediaId, userId],
  );
  if (!rows[0]) throw httpError(404, "MEDIA_NOT_FOUND", "Không tìm thấy ảnh");
  return rows[0];
}

async function removeKeys(row) {
  const keys = EDIT_KEYS.map((k) => row[k]).filter(Boolean);
  if (keys.length === 0) return;
  await minioClient
    .removeObjects(row.minio_bucket || BUCKET_NAME, keys)
    .catch((err) => logger.error({ err }, "Lỗi xoá ảnh đã chỉnh trên MinIO"));
}

const toDto = (mediaId, row) => ({
  recipe: row?.recipe ?? null,
  updatedAt: row?.updated_at ?? null,
  // Editor luôn chỉnh từ bản display GỐC (không chồng chỉnh lên ảnh đã chỉnh).
  sourceUrl: mediaThumbUrl(mediaId, "base"),
});

export async function getEdit(userId, mediaId) {
  const row = await ownPhoto(userId, mediaId);
  return toDto(mediaId, row.recipe ? row : null);
}

export async function saveEdit(userId, mediaId, recipe, filePath) {
  const old = await ownPhoto(userId, mediaId);
  let d;
  try {
    d = await buildImageDerivatives(filePath);
  } catch {
    throw httpError(400, "INVALID_IMAGE", "Ảnh đã chỉnh không đọc được");
  }
  const bucket = old.minio_bucket || BUCKET_NAME;
  const base = `${userId}/edits/${mediaId}/${Date.now()}`;
  const keys = { display_object: `${base}-display.webp`, thumbnail_object: `${base}-med.webp`, thumbnail_small_object: `${base}-small.webp` };
  await Promise.all([
    minioClient.putObject(bucket, keys.display_object, d.display, d.display.length, WEBP),
    minioClient.putObject(bucket, keys.thumbnail_object, d.med, d.med.length, WEBP),
    minioClient.putObject(bucket, keys.thumbnail_small_object, d.small, d.small.length, WEBP),
  ]);
  const { rows } = await dbPool.query(
    `INSERT INTO media_edits (media_id, recipe, display_object, thumbnail_object, thumbnail_small_object)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (media_id) DO UPDATE SET recipe = EXCLUDED.recipe,
       display_object = EXCLUDED.display_object, thumbnail_object = EXCLUDED.thumbnail_object,
       thumbnail_small_object = EXCLUDED.thumbnail_small_object, updated_at = now()
     RETURNING recipe, updated_at`,
    [mediaId, recipe, keys.display_object, keys.thumbnail_object, keys.thumbnail_small_object],
  );
  // Xoá bản chỉnh trước SAU khi row đã trỏ sang bản mới (không mất ảnh nếu lỗi giữa chừng).
  if (old.recipe) await removeKeys(old);
  return toDto(mediaId, rows[0]);
}

export async function deleteEdit(userId, mediaId) {
  await ownPhoto(userId, mediaId);
  const { rows } = await dbPool.query(
    `DELETE FROM media_edits e USING media m
     WHERE e.media_id = $1 AND m.id = e.media_id
     RETURNING m.minio_bucket, e.display_object, e.thumbnail_object, e.thumbnail_small_object`,
    [mediaId],
  );
  if (rows[0]) await removeKeys(rows[0]);
  return toDto(mediaId, null);
}
