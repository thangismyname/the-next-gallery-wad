import { dbPool } from "../../config/db.js";
import { semanticSearch } from "../ai/embedding.service.js";
import { hybridSearch } from "../ai/hybrid.search.service.js";
import { parseQuery } from "../ai/search.query.js";
import { parseDateQuery } from "../ai/search.date.js";
import { resolveTimeZone } from "../albums/albums.auto.service.js";
import { searchByObject } from "../ai/detection.service.js";
import { findSimilarMedia } from "../ai/similarity.service.js";
import { listMediaIdsByTag } from "../ai/tagging.service.js";
import { MEDIA_COLUMNS, mediaThumbUrl, toMediaItem } from "./media.mapper.js";
import { getMediaItemsByIds } from "./media.list.service.js";
import { scopeMediaIds } from "./media.scope.js";
import { logger } from "../../lib/logger.js";

const SCOPE_LIST_LIMIT = 60;

// Tìm ảnh cho Spotlight search.
//  - mode "hybrid" (mặc định): search kết hợp CLIP + tag nội dung + vật thể YOLO
//    (hybrid.search.service.js) — hiểu "2 con chó trên bãi biển".
//  - mode "clip": CLIP text→image thuần (cosine ≥ AI_CLIP_MIN_SIM) — giữ để so sánh.
// Có embedding mà không ảnh nào đạt → trả rỗng; chỉ fallback tìm theo tên file
// khi user chưa có embedding nào (của model CLIP hiện tại) hoặc ai-service lỗi.
export async function searchMedia(userId, rawQuery, { mode = "hybrid", scope, tz } = {}) {
  // Phạm vi (Spotlight chip: Yêu thích / 1 nhãn / 1 album) ∩ ngày trong câu ("2026", "tháng 3", "19/11").
  const { query, ids: scopeIds } = await narrowSearch(userId, rawQuery, { scope, tz });
  if (scopeIds && !query) {
    // Chỉ có phạm vi / ngày, không còn chữ → liệt kê ảnh (mới nhất trước).
    return getMediaItemsByIds(userId, scopeIds.slice(0, SCOPE_LIST_LIMIT));
  }
  const onlyIds = scopeIds && new Set(scopeIds);

  try {
    const { hits, hadEmbeddings } =
      mode === "clip"
        ? await semanticSearch(userId, query, onlyIds ? 1000 : 20)
        : await hybridSearch(userId, query, { limit: 20, onlyIds });
    if (hadEmbeddings) {
      const scoped = (onlyIds ? hits.filter((hit) => onlyIds.has(hit.id)) : hits).slice(0, 20);
      const hitById = new Map(scoped.map((hit) => [hit.id, hit]));
      const items = await getMediaItemsByIds(
        userId,
        scoped.map((hit) => hit.id),
      );
      return items.map((item) => ({
        ...item,
        score: hitById.get(item.id)?.score ?? null,
        // Điểm từng phần (clip / tag / object) — UI giải thích vì sao khớp.
        scoreParts: hitById.get(item.id)?.parts ?? null,
      }));
    }
  } catch (err) {
    logger.warn({ err }, `Semantic search lỗi, fallback tên file`);
  }

  const result = await dbPool.query(
    `SELECT ${MEDIA_COLUMNS}
     FROM media
     WHERE user_id = $1
       AND deleted_at IS NULL
       AND (original_filename ILIKE $2)
       AND ($3::uuid[] IS NULL OR id = ANY($3::uuid[]))
     ORDER BY created_at DESC
     LIMIT 20`,
    [userId, `%${query}%`, scopeIds],
  );

  return result.rows.map(toMediaItem);
}

/**
 * Ngày trong câu → id ảnh có ngày chụp (taken_at, không có thì ngày tải lên) khớp năm / tháng / ngày theo
 * múi giờ client (giống cách Thư viện nhóm ảnh), giao với phạm vi. Trả phần chữ còn lại để search tiếp.
 * @returns {Promise<{ query: string, ids: string[] | null }>} ids null = không giới hạn.
 */
async function narrowSearch(userId, rawQuery, { scope, tz }) {
  let ids = scope ? await scopeMediaIds(userId, scope) : null;
  const date = parseDateQuery(rawQuery);
  if (!date) return { query: rawQuery, ids };
  const result = await dbPool.query(
    `SELECT id FROM (
       SELECT id, COALESCE(taken_at, created_at) AT TIME ZONE $2 AS t
         FROM media WHERE user_id = $1 AND deleted_at IS NULL
     ) m
     WHERE ($3::int IS NULL OR EXTRACT(YEAR FROM t) = $3)
       AND ($4::int IS NULL OR EXTRACT(MONTH FROM t) = $4)
       AND ($5::int IS NULL OR EXTRACT(DAY FROM t) = $5)
     ORDER BY t DESC`,
    [userId, await resolveTimeZone(tz), date.year ?? null, date.month ?? null, date.day ?? null],
  );
  const dated = result.rows.map((row) => String(row.id));
  if (ids) {
    const inDate = new Set(dated);
    ids = ids.filter((id) => inDate.has(id));
  } else {
    ids = dated;
  }
  return { query: date.rest, ids };
}

// Tìm ảnh theo ĐỐI TƯỢNG (YOLO26) cho Spotlight — khớp class_name.
// Trả MediaListItem kèm `score` (confidence cao nhất) giống semantic search.
export async function searchMediaObjects(userId, rawQuery, { limit = 20, scope, tz } = {}) {
  const { query, ids: onlyIds } = await narrowSearch(userId, rawQuery, { scope, tz });
  if (!query) return []; // chỉ có ngày → ảnh đã nằm ở nhóm Ảnh, không có vật thể nào để tìm
  const classes = [...new Set(parseQuery(query).objects.map((o) => o.cls))];
  const hits = await searchByObject(userId, query, { limit, classes, onlyIds });
  const scoreById = new Map(hits.map((hit) => [hit.id, hit.score]));
  const items = await getMediaItemsByIds(
    userId,
    hits.map((hit) => hit.id),
  );
  return items.map((item) => ({
    ...item,
    score: scoreById.get(item.id) ?? null,
  }));
}

// Ảnh tương tự (DINOv3, fallback CLIP) cho Lightbox — MediaListItem kèm `score`.
export async function searchSimilarMedia(userId, mediaId, { limit = 12 } = {}) {
  const { source, model, hits } = await findSimilarMedia(userId, mediaId, { limit });
  const scoreById = new Map(hits.map((hit) => [hit.id, hit.score]));
  const items = await getMediaItemsByIds(
    userId,
    hits.map((hit) => hit.id),
  );
  return {
    source,
    model,
    items: items.map((item) => ({
      ...item,
      score: scoreById.get(item.id) ?? null,
    })),
  };
}

// Ảnh theo tag nội dung (AI Studio) — MediaListItem kèm `score` = confidence.
export async function searchMediaByTag(userId, tag, options) {
  const { hits, total } = await listMediaIdsByTag(userId, tag, options);
  const scoreById = new Map(hits.map((hit) => [hit.id, hit.score]));
  const items = await getMediaItemsByIds(
    userId,
    hits.map((hit) => hit.id),
  );
  return {
    total,
    items: items.map((item) => ({
      ...item,
      score: scoreById.get(item.id) ?? null,
    })),
  };
}

// Tìm album theo tên — dùng cho Spotlight search
export async function searchAlbums(userId, query) {
  const result = await dbPool.query(
    `SELECT id, name, description, cover_media_id
     FROM albums
     WHERE user_id = $1
       AND (name ILIKE $2 OR description ILIKE $2)
     ORDER BY created_at DESC
     LIMIT 10`,
    [userId, `%${query}%`],
  );

  const albums = result.rows;
  if (albums.length === 0) return [];

  const coverIds = albums
    .filter((a) => a.cover_media_id !== null)
    .map((a) => a.cover_media_id);

  const coverMap = new Map();
  if (coverIds.length > 0) {
    const coverResult = await dbPool.query(
      `SELECT id, thumbnail_small_object
       FROM media WHERE id = ANY($1::uuid[])`,
      [coverIds],
    );
    for (const row of coverResult.rows) {
      coverMap.set(String(row.id), row.thumbnail_small_object);
    }
  }

  const missingCoverIds = albums
    .filter((a) => a.cover_media_id === null)
    .map((a) => a.id);

  const latestByAlbum = new Map();
  if (missingCoverIds.length > 0) {
    const latestResult = await dbPool.query(
      `SELECT DISTINCT ON (am.album_id)
         am.album_id, m.id AS media_id, m.thumbnail_small_object
       FROM album_media am
       JOIN media m ON m.id = am.media_id
       WHERE am.album_id = ANY($1::uuid[])
       ORDER BY am.album_id, m.created_at DESC`,
      [missingCoverIds],
    );
    for (const row of latestResult.rows) {
      latestByAlbum.set(String(row.album_id), row);
    }
  }

  const countResult = await dbPool.query(
    `SELECT album_id, COUNT(*)::int AS media_count
     FROM album_media
     WHERE album_id = ANY($1::uuid[])
     GROUP BY album_id`,
    [albums.map((a) => a.id)],
  );
  const countMap = new Map(countResult.rows.map((r) => [String(r.album_id), r.media_count]));

  return albums.map((a) => {
    const id = String(a.id);
    const coverThumb = coverMap.get(id);
    const latest = latestByAlbum.get(id);
    const thumbObj = coverThumb || latest?.thumbnail_small_object;
    return {
      id,
      name: a.name,
      description: a.description || "",
      coverUrl: thumbObj
        ? mediaThumbUrl(
            coverThumb ? String(a.cover_media_id) : String(latest.media_id),
            "med",
          )
        : null,
      mediaCount: countMap.get(id) || 0,
    };
  });
}
