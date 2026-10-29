// Album thông minh = truy vấn lưu lại, tính lại mỗi lần mở (ảnh mới khớp tự vào):
//   tags   ảnh của owner có ĐỦ các tag nội dung (media_tags, confidence ≥ ngưỡng)
//   query  câu search kết hợp (CLIP + tag + YOLO — hybrid.search.service.js)
import { dbPool } from "../../config/db.js";
import { hybridSearch } from "../ai/hybrid.search.service.js";
import { SMART_QUERY_LIMIT } from "./albums.constants.js";

const TAG_LIMIT = 5000;

/** → hits theo thứ tự hiển thị: { id, score }[] (ảnh của owner album). */
export async function resolveSmartHits(ownerId, rule) {
  if (rule?.type === "tags") {
    const result = await dbPool.query(
      `SELECT t.media_id, AVG(t.confidence) AS score
       FROM media_tags t
       JOIN media m ON m.id = t.media_id AND m.deleted_at IS NULL
       WHERE t.user_id = $1
         AND t.tag = ANY($2::text[])
         AND t.confidence >= COALESCE($3::real, t.threshold)
       GROUP BY t.media_id
       HAVING COUNT(*) = $4
       ORDER BY score DESC
       LIMIT ${TAG_LIMIT}`,
      [ownerId, rule.tags, rule.minConfidence ?? null, rule.tags.length],
    );
    return result.rows.map((r) => ({ id: String(r.media_id), score: Number(r.score) }));
  }
  if (rule?.type === "query") {
    const { hits } = await hybridSearch(ownerId, rule.query, {
      limit: SMART_QUERY_LIMIT,
    });
    return hits.map(({ id, score }) => ({ id, score }));
  }
  return [];
}

/** Số ảnh + ảnh bìa (ảnh khớp nhất) cho thẻ album. ai-service lỗi → rỗng. */
export async function smartSummary(ownerId, rule) {
  try {
    const hits = await resolveSmartHits(ownerId, rule);
    return { mediaCount: hits.length, coverId: hits[0]?.id ?? null };
  } catch (err) {
    console.warn(`⚠️  Album thông minh lỗi: ${err.message}`);
    return { mediaCount: 0, coverId: null };
  }
}
