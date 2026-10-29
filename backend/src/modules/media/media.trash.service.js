import { dbPool } from "../../config/db.js";
import { minioClient, BUCKET_NAME } from "../../config/minio.js";
import { MEDIA_COLUMNS, toMediaItem } from "./media.mapper.js";

export async function softDeleteMedia(userId, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return { count: 0 };

  const result = await dbPool.query(
    `UPDATE media
     SET deleted_at = NOW(), updated_at = NOW()
     WHERE user_id = $1
       AND id = ANY($2::uuid[])
       AND deleted_at IS NULL
     RETURNING id`,
    [userId, ids],
  );

  return { count: result.rowCount };
}

export async function listTrash(userId, { limit, offset }) {
  const result = await dbPool.query(
    `SELECT ${MEDIA_COLUMNS}
    FROM media
    WHERE user_id = $1
      AND deleted_at IS NOT NULL
    ORDER BY deleted_at DESC
    LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );

  const items = result.rows.map(toMediaItem);

  return {
    items,
    hasMore: result.rows.length === limit,
    limit,
    offset,
  };
}

export async function restoreMedia(userId, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return { count: 0 };

  const result = await dbPool.query(
    `UPDATE media
     SET deleted_at = NULL, updated_at = NOW()
     WHERE user_id = $1
       AND id = ANY($2::uuid[])
       AND deleted_at IS NOT NULL
     RETURNING id`,
    [userId, ids],
  );

  return { count: result.rowCount };
}

export async function permanentDeleteMedia(userId, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return { count: 0 };

  // Lấy danh sách object cần xoá trên MinIO trước khi xoá row — gom batch giống
  // các media dính album/moment: album_media/moments/moment_reactions có FK
  // ON DELETE CASCADE / SET NULL nên xoá row media là đủ, DB tự dọn.
  const picked = await dbPool.query(
    `SELECT id, minio_object, minio_bucket, thumbnail_object, thumbnail_small_object,
            display_object, full_object
     FROM media
     WHERE user_id = $1
       AND id = ANY($2::uuid[])
       AND deleted_at IS NOT NULL`,
    [userId, ids],
  );

  if (picked.rows.length === 0) return { count: 0 };

  // Gom object keys để gọi removeObjects hàng loạt trên MinIO
  const objects = new Set();
  for (const row of picked.rows) {
    if (row.minio_object) objects.add(row.minio_object);
    if (row.thumbnail_object) objects.add(row.thumbnail_object);
    if (row.thumbnail_small_object) objects.add(row.thumbnail_small_object);
    if (row.display_object) objects.add(row.display_object);
    if (row.full_object) objects.add(row.full_object);
  }

  const objectList = Array.from(objects);
  const bucket = picked.rows[0].minio_bucket || BUCKET_NAME;
  if (objectList.length > 0) {
    try {
      await minioClient.removeObjects(bucket, objectList);
    } catch (err) {
      console.error("Lỗi xoá object trên MinIO:", err.message);
    }
  }

  const result = await dbPool.query(
    `DELETE FROM media
     WHERE user_id = $1
       AND id = ANY($2::uuid[])
       AND deleted_at IS NOT NULL
     RETURNING id`,
    [userId, ids],
  );

  return { count: result.rowCount };
}

/** Dọn sạch thùng rác của user (xoá vĩnh viễn mọi media đã soft-delete). */
export async function emptyTrash(userId) {
  const trashed = await dbPool.query(
    `SELECT id FROM media WHERE user_id = $1 AND deleted_at IS NOT NULL`,
    [userId],
  );
  return permanentDeleteMedia(
    userId,
    trashed.rows.map((r) => r.id),
  );
}
