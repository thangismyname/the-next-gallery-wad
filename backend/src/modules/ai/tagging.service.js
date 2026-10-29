// Tagging service — gắn tag nội dung (classification, 17 tag) cho ảnh.
//
// Luồng:
//  - ai-service chấm tag từ vector CLIP đã lưu trong media_embeddings → không
//    cần đọc lại ảnh, 1 request chấm được cả lô.
//  - Upload: embedding.service chạy `tagMediaIds` ngay sau khi lưu embedding.
//  - Ảnh cũ: `backfillTags` (embed trước nếu ảnh chưa có embedding).
//  - Lưu xác suất của MỌI tag (kể cả dưới ngưỡng) → UI đổi ngưỡng tự do.
import { dbPool } from "../../config/db.js";
import { currentModels, predictTags } from "./ai.client.js";
import { embedMediaById } from "./embedding.service.js";
import { mediaThumbUrl } from "../media/media.mapper.js";

/** Chấm tag cho các ảnh đã có embedding và lưu (thay toàn bộ tag cũ). */
export async function tagMediaIds(userId, mediaIds) {
  if (mediaIds.length === 0) return { tagged: 0 };
  const rows = await dbPool.query(
    `SELECT e.media_id, e.embedding::text AS embedding
     FROM media_embeddings e
     WHERE e.user_id = $1 AND e.media_id = ANY($2::uuid[])`,
    [userId, mediaIds],
  );
  if (rows.rows.length === 0) return { tagged: 0 };

  const ids = rows.rows.map((r) => String(r.media_id));
  const result = await predictTags(rows.rows.map((r) => JSON.parse(r.embedding)));

  // Trải phẳng (ảnh × tag) để insert 1 câu bằng unnest.
  const values = { media: [], tag: [], confidence: [], threshold: [] };
  result.scores.forEach((scores, i) => {
    scores.forEach((confidence, j) => {
      values.media.push(ids[i]);
      values.tag.push(result.tags[j]);
      values.confidence.push(confidence);
      values.threshold.push(result.thresholds[j]);
    });
  });

  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM media_tags WHERE user_id = $1 AND media_id = ANY($2::uuid[])`,
      [userId, ids],
    );
    await client.query(
      `INSERT INTO media_tags (media_id, user_id, tag, confidence, threshold, model)
       SELECT m, $1, t, c, th, $6
       FROM unnest($2::uuid[], $3::text[], $4::real[], $5::real[]) AS x(m, t, c, th)`,
      [
        userId,
        values.media,
        values.tag,
        values.confidence,
        values.threshold,
        result.model,
      ],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return { tagged: ids.length };
}

// Ảnh (photo, chưa xoá) của user chưa có tag — hoặc tag do model khác chấm
// (đổi CLIP / train lại probe → tên model ở ai-service đổi). `$2` = model hiện
// tại; null (ai-service không phản hồi) → chỉ tính ảnh chưa có tag nào.
const NEEDS_TAGS = `
  m.user_id = $1
  AND m.media_type = 'photo'
  AND m.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM media_tags t
    WHERE t.media_id = m.id AND ($2::text IS NULL OR t.model = $2)
  )`;

/**
 * Gắn tag cho ảnh cũ chưa có tag (theo lô). Ảnh chưa có embedding CLIP (hoặc
 * embedding của model cũ) thì embed trước — chậm hơn vì phải đọc ảnh. Trả
 * thống kê giống các backfill khác.
 */
export async function backfillTags(userId, { limit = 100 } = {}) {
  const { clipModel, tagModel } = await currentModels();
  const picked = await dbPool.query(
    `SELECT m.id,
            EXISTS (
              SELECT 1 FROM media_embeddings e
              WHERE e.media_id = m.id AND ($3::text IS NULL OR e.model = $3)
            ) AS has_embedding
     FROM media m
     WHERE ${NEEDS_TAGS}
     ORDER BY m.created_at DESC
     LIMIT $4`,
    [userId, tagModel, clipModel, limit],
  );

  let failed = 0;
  const ready = [];
  for (const row of picked.rows) {
    const id = String(row.id);
    if (row.has_embedding) {
      ready.push(id);
      continue;
    }
    try {
      if (await embedMediaById(id, userId)) ready.push(id);
      else failed += 1;
    } catch (err) {
      failed += 1;
      console.warn(`⚠️  Backfill tag: embed ${id} lỗi: ${err.message}`);
    }
  }

  let tagged = 0;
  try {
    ({ tagged } = await tagMediaIds(userId, ready));
  } catch (err) {
    console.warn(`⚠️  Backfill tag lỗi: ${err.message}`);
  }
  failed += ready.length - tagged;

  const pending = await dbPool.query(
    `SELECT COUNT(*)::int AS count FROM media m WHERE ${NEEDS_TAGS}`,
    [userId, tagModel],
  );
  return { tagged, failed, remaining: pending.rows[0]?.count ?? 0 };
}

/** Thống kê số ảnh / số ảnh đã gắn tag bằng model hiện tại. */
export async function getTagStats(userId) {
  const { tagModel } = await currentModels();
  const result = await dbPool.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE ${NEEDS_TAGS})::int AS pending
     FROM media m
     WHERE m.user_id = $1
       AND m.media_type = 'photo'
       AND m.deleted_at IS NULL`,
    [userId, tagModel],
  );
  const row = result.rows[0] ?? { total: 0, pending: 0 };
  return { total: row.total, tagged: row.total - row.pending, pending: row.pending };
}

/**
 * Tổng quan theo tag: số ảnh đạt ngưỡng + ảnh bìa (confidence cao nhất).
 * Tag chưa có ảnh nào đạt ngưỡng vẫn trả về (count = 0) để UI hiện đủ danh mục.
 */
export async function listTagSummary(userId) {
  const result = await dbPool.query(
    `SELECT t.tag,
            COUNT(*) FILTER (WHERE t.confidence >= t.threshold)::int AS count,
            MAX(t.threshold) AS threshold,
            (ARRAY_AGG(t.media_id ORDER BY t.confidence DESC))[1] AS cover_id,
            MAX(t.confidence) AS top_confidence
     FROM media_tags t
     JOIN media m ON m.id = t.media_id AND m.deleted_at IS NULL
     WHERE t.user_id = $1
     GROUP BY t.tag`,
    [userId],
  );
  return result.rows.map((row) => ({
    tag: row.tag,
    count: row.count,
    threshold: Number(row.threshold),
    coverUrl: row.cover_id ? mediaThumbUrl(String(row.cover_id), "med") : null,
    topConfidence: Number(row.top_confidence),
  }));
}

/**
 * Ảnh của 1 tag, xếp theo confidence giảm dần. `minConfidence` bỏ trống → dùng
 * ngưỡng của tag. Trả `{ hits: { id, score }[], total }`.
 */
export async function listMediaIdsByTag(
  userId,
  tag,
  { minConfidence = null, limit = 60, offset = 0 } = {},
) {
  const params = [userId, tag, minConfidence];
  const where = `
    WHERE t.user_id = $1
      AND t.tag = $2
      AND m.deleted_at IS NULL
      AND t.confidence >= COALESCE($3::real, t.threshold)`;
  const [rows, count] = await Promise.all([
    dbPool.query(
      `SELECT t.media_id, t.confidence
       FROM media_tags t
       JOIN media m ON m.id = t.media_id
       ${where}
       ORDER BY t.confidence DESC, m.created_at DESC
       LIMIT $4 OFFSET $5`,
      [...params, limit, offset],
    ),
    dbPool.query(
      `SELECT COUNT(*)::int AS total
       FROM media_tags t
       JOIN media m ON m.id = t.media_id
       ${where}`,
      params,
    ),
  ]);
  return {
    hits: rows.rows.map((r) => ({
      id: String(r.media_id),
      score: Number(r.confidence),
    })),
    total: count.rows[0]?.total ?? 0,
  };
}
