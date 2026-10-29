// Detection service — lưu/backfill kết quả YOLO26 object detection + search theo
// đối tượng. Mirror embedding.service.js (CLIP) nhưng cho bounding box/class.
//
// Luồng:
//  - Upload ảnh → media.service gọi `detectMediaInBackground` (fire-and-forget).
//  - Ảnh cũ chưa detect → `backfillDetections` xử lý theo lô.
//  - Search theo vật thể → `searchByObject` (JOIN media_detections).
//  - Developer Mode → `getMediaDetections` trả bbox để vẽ overlay.
import { dbPool } from "../../config/db.js";
import { readAiSourceBuffer } from "../media/media.derivatives.service.js";
import { detectObjects } from "./ai.client.js";
import sharp from "sharp";

// Cạnh dài tối đa khi gửi ảnh cho YOLO — bbox chuẩn hoá 0–1 nên scale đều
// (giữ aspect ratio) không làm sai toạ độ; payload nhỏ hơn, nhanh hơn.
const DETECT_MAX_EDGE = 1280;

// Ngưỡng confidence mặc định cho search (khác ngưỡng lưu của provider).
const SEARCH_MIN_CONF = Number.isFinite(Number(process.env.AI_YOLO_MIN_CONF))
  ? Number(process.env.AI_YOLO_MIN_CONF)
  : 0.4;

function toPgRealArray(values) {
  return `{${values.map((v) => Number(v)).join(",")}}`;
}

async function toDetectBuffer(buffer) {
  return sharp(buffer)
    .rotate()
    .resize(DETECT_MAX_EDGE, DETECT_MAX_EDGE, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();
}

/**
 * Thay toàn bộ detection của 1 media cho 1 model (idempotent khi backfill lại).
 */
export async function saveDetections(mediaId, userId, model, detections) {
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM media_detections WHERE media_id = $1 AND model = $2`,
      [mediaId, model],
    );
    for (const det of detections) {
      await client.query(
        `INSERT INTO media_detections
           (media_id, user_id, class_name, confidence, bbox, model)
         VALUES ($1, $2, $3, $4, $5::real[], $6)
         ON CONFLICT (media_id, model, class_name, confidence, bbox)
         DO NOTHING`,
        [
          mediaId,
          userId,
          det.class_name,
          det.confidence,
          toPgRealArray(det.bbox),
          model,
        ],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Detect từ buffer ảnh có sẵn (upload) và lưu vào DB.
 */
export async function detectMediaBuffer({ mediaId, userId, buffer }) {
  const prepared = await toDetectBuffer(buffer);
  const result = await detectObjects(prepared, "image/jpeg", `${mediaId}`);
  const detections = Array.isArray(result?.detections) ? result.detections : [];
  await saveDetections(mediaId, userId, result?.model || "yolo26n", detections);
  // Đánh dấu đã xử lý (kể cả 0 object) để backfill không lặp lại ảnh này.
  await dbPool.query(
    `UPDATE media SET yolo_processed_at = now() WHERE id = $1`,
    [mediaId],
  );
  return result;
}

/** Fire-and-forget — chạy nền, mọi lỗi chỉ log. */
export function detectMediaInBackground(args) {
  detectMediaBuffer(args).catch((err) => {
    console.warn(`⚠️  Detect media ${args.mediaId} lỗi: ${err.message}`);
  });
}

/** Lấy object gốc từ MinIO rồi detect — dùng cho backfill ảnh cũ. */
export async function detectMediaById(mediaId, userId) {
  const result = await dbPool.query(
    `SELECT id, user_id, minio_object, minio_bucket, display_object,
            thumbnail_object, thumbnail_small_object, media_type
     FROM media
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [mediaId, userId],
  );
  if (result.rows.length === 0) return null;

  const media = result.rows[0];
  if (media.media_type !== "photo") return null;

  const buffer = await readAiSourceBuffer(media);

  return detectMediaBuffer({ mediaId, userId, buffer });
}

/**
 * Detect các ảnh chưa chạy YOLO (theo lô). Dùng cột `media.yolo_processed_at`
 * làm cờ: ảnh đã chạy (kể cả 0 object) sẽ không xử lý lại.
 */
export async function backfillDetections(userId, { limit = 25 } = {}) {
  const result = await dbPool.query(
    `SELECT m.id
     FROM media m
     WHERE m.user_id = $1
       AND m.media_type = 'photo'
       AND m.deleted_at IS NULL
       AND m.yolo_processed_at IS NULL
     ORDER BY m.created_at DESC
     LIMIT $2`,
    [userId, limit],
  );

  let detected = 0;
  let failed = 0;
  for (const row of result.rows) {
    try {
      const done = await detectMediaById(String(row.id), userId);
      if (done) detected += 1;
      else failed += 1;
    } catch (err) {
      failed += 1;
      console.warn(`⚠️  Backfill detect ${row.id} lỗi: ${err.message}`);
    }
  }

  const pending = await dbPool.query(
    `SELECT COUNT(*)::int AS count
     FROM media m
     WHERE m.user_id = $1
       AND m.media_type = 'photo'
       AND m.deleted_at IS NULL
       AND m.yolo_processed_at IS NULL`,
    [userId],
  );

  return { detected, failed, remaining: pending.rows[0]?.count ?? 0 };
}

/** Thống kê số ảnh / số ảnh đã chạy detection của user. */
export async function getDetectionStats(userId) {
  const result = await dbPool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(yolo_processed_at)::int AS detected
     FROM media m
     WHERE m.user_id = $1
       AND m.media_type = 'photo'
       AND m.deleted_at IS NULL`,
    [userId],
  );
  const row = result.rows[0] ?? { total: 0, detected: 0 };
  return {
    total: row.total,
    detected: row.detected,
    pending: Math.max(0, row.total - row.detected),
  };
}

/**
 * Tìm media có chứa object khớp `object` (khớp mờ theo class_name).
 * @returns {Promise<{ id: string, score: number }[]>} score = confidence cao nhất.
 */
export async function searchByObject(
  userId,
  object,
  { limit = 20, minConf, classes = [], onlyIds = null } = {},
) {
  const threshold = Number.isFinite(minConf) ? minConf : SEARCH_MIN_CONF;
  // `classes` = class COCO đã hiểu từ câu (search.query.js — "chai" → bottle,
  // "犬" → dog) → khớp đúng tên; không hiểu → khớp thô class_name ILIKE.
  // `onlyIds` = phạm vi Spotlight (Yêu thích / nhãn / album).
  const result = await dbPool.query(
    `SELECT d.media_id AS id, MAX(d.confidence) AS score
     FROM media_detections d
     JOIN media m ON m.id = d.media_id
     WHERE d.user_id = $1
       AND m.deleted_at IS NULL
       AND m.media_type = 'photo'
       AND (CASE WHEN cardinality($5::text[]) > 0
                 THEN d.class_name = ANY($5::text[])
                 ELSE d.class_name ILIKE $2 END)
       AND d.confidence >= $3
       AND ($6::uuid[] IS NULL OR d.media_id = ANY($6::uuid[]))
     GROUP BY d.media_id
     ORDER BY score DESC
     LIMIT $4`,
    [userId, `%${object}%`, threshold, limit, classes, onlyIds],
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    score: Number(row.score),
  }));
}

/** Danh sách class đã phát hiện của user + số ảnh — gợi ý cho ô search. */
export async function listDetectionClasses(userId, { limit = 50 } = {}) {
  const result = await dbPool.query(
    `SELECT d.class_name, COUNT(DISTINCT d.media_id)::int AS count
     FROM media_detections d
     JOIN media m ON m.id = d.media_id
     WHERE d.user_id = $1 AND m.deleted_at IS NULL
     GROUP BY d.class_name
     ORDER BY count DESC
     LIMIT $2`,
    [userId, limit],
  );
  return result.rows.map((row) => ({
    class_name: row.class_name,
    count: row.count,
  }));
}

/** Toàn bộ detection của 1 media (kèm bbox) — dùng cho Developer Mode. */
export async function getMediaDetections(mediaId, userId) {
  const result = await dbPool.query(
    `SELECT class_name, confidence, bbox, model
     FROM media_detections
     WHERE media_id = $1 AND user_id = $2
     ORDER BY confidence DESC`,
    [mediaId, userId],
  );
  return result.rows.map((row) => ({
    class_name: row.class_name,
    confidence: Number(row.confidence),
    bbox: row.bbox,
    model: row.model,
  }));
}
