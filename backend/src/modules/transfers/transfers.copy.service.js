// Gửi ảnh ĐÃ CÓ trong thư viện cho bạn bè: copy thẳng trong MinIO sang tài
// khoản người nhận (không truyền byte qua mạng) + copy luôn kết quả AI (CLIP,
// DINOv3, YOLO, tag) vì cùng 1 ảnh → bạn bè tìm kiếm được ngay.
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dbPool } from "../../config/db.js";
import { minioClient } from "../../config/minio.js";
import { logger } from "../../lib/logger.js";

const OBJECT_COLUMNS = ["minio_object", "thumbnail_object", "thumbnail_small_object", "display_object", "full_object", "motion_object"];

async function copyObject(bucket, source, recipientId) {
  if (!source) return null;
  const target = `${recipientId}/${randomUUID()}${path.extname(source)}`;
  await minioClient.copyObject(bucket, target, `/${bucket}/${source}`);
  return target;
}

async function copyOne(client, media, recipientId) {
  const objects = {};
  for (const col of OBJECT_COLUMNS) {
    objects[col] = await copyObject(media.minio_bucket, media[col], recipientId);
  }
  // Cột ↔ giá trị theo cặp (24 cột) — thêm cột thì thêm cả 2 danh sách.
  const { rows } = await client.query(
    `INSERT INTO media
       (user_id, media_type, original_filename, caption, taken_at, width, height, duration_seconds, fps, video_codec, minio_object, minio_bucket, thumbnail_object, thumbnail_small_object, display_object, full_object, motion_object, file_ext, mime_type, file_size_kb, yolo_processed_at, content_sha256, latitude, longitude, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, NOW(), NOW())
     RETURNING id`,
    [
      recipientId,
      media.media_type,
      media.original_filename,
      media.caption,
      media.taken_at,
      media.width,
      media.height,
      media.duration_seconds,
      media.fps,
      media.video_codec,
      objects.minio_object,
      media.minio_bucket,
      objects.thumbnail_object,
      objects.thumbnail_small_object,
      objects.display_object,
      objects.full_object,
      objects.motion_object,
      media.file_ext,
      media.mime_type,
      media.file_size_kb,
      media.yolo_processed_at,
      media.content_sha256,
      media.latitude,
      media.longitude,
    ],
  );
  const newId = rows[0].id;
  const params = [media.id, newId, recipientId];
  await client.query(
    `INSERT INTO media_embeddings (media_id, user_id, model, embedding)
     SELECT $2, $3, model, embedding FROM media_embeddings WHERE media_id = $1`,
    params,
  );
  await client.query(
    `INSERT INTO media_dino_embeddings (media_id, user_id, model, embedding)
     SELECT $2, $3, model, embedding FROM media_dino_embeddings WHERE media_id = $1`,
    params,
  );
  await client.query(
    `INSERT INTO media_detections (media_id, user_id, class_name, confidence, bbox, model)
     SELECT $2, $3, class_name, confidence, bbox, model FROM media_detections WHERE media_id = $1`,
    params,
  );
  await client.query(
    `INSERT INTO media_tags (media_id, user_id, tag, confidence, threshold, model)
     SELECT $2, $3, tag, confidence, threshold, model FROM media_tags WHERE media_id = $1`,
    params,
  );
  return newId;
}

/**
 * Copy các ảnh của `senderId` sang thư viện từng người nhận. Mỗi người nhận 1
 * transaction — lỗi ở 1 người không chặn người khác.
 * @returns {Promise<string[]>} userId đã nhận đủ.
 */
export async function copyMediaToRecipients(senderId, mediaIds, recipientIds) {
  if (mediaIds.length === 0 || recipientIds.length === 0) return [];
  const { rows: media } = await dbPool.query(
    `SELECT * FROM media WHERE user_id = $1 AND deleted_at IS NULL AND id = ANY($2::uuid[])`,
    [senderId, mediaIds],
  );
  const done = [];
  for (const recipientId of recipientIds) {
    const client = await dbPool.connect();
    try {
      await client.query("BEGIN");
      for (const m of media) await copyOne(client, m, recipientId);
      await client.query("COMMIT");
      done.push(recipientId);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      logger.error({ err }, `[transfers] copy to ${recipientId} failed`);
    } finally {
      client.release();
    }
  }
  return done;
}
