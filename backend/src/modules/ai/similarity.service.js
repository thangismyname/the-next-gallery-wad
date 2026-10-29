// Similarity service — DINOv3 descriptor cho tính năng "Ảnh tương tự" (Lightbox).
//
// Luồng:
//  - Upload ảnh → media.upload.service gọi `embedDinoInBackground` (fire-and-forget).
//  - Ảnh cũ chưa có descriptor → `backfillDinoEmbeddings` theo lô, hoặc tạo
//    on-demand lần đầu mở "Ảnh tương tự" của ảnh đó.
//  - `findSimilarMedia`: cosine (pgvector `<=>`) giữa ảnh nguồn và ảnh khác của
//    user. Chưa có DINOv3 → fallback CLIP image↔image (media_embeddings).
import { dbPool } from "../../config/db.js";
import { readAiSourceBuffer } from "../media/media.derivatives.service.js";
import { embedImageDino } from "./ai.client.js";
import sharp from "sharp";

// DINOv3 processor resize về 224px — 512px là dư đủ, payload nhỏ.
const DINO_MAX_EDGE = 512;

// Ngưỡng cosine tối thiểu để coi là "tương tự". DINOv3 CLS: ảnh cùng chủ đề/
// cảnh thường ≥0.4, gần trùng ≥0.8. Đặt 0 để tắt ngưỡng.
const DINO_MIN_SIM = Number.isFinite(Number(process.env.AI_DINO_MIN_SIM))
  ? Number(process.env.AI_DINO_MIN_SIM)
  : 0.35;

// CLIP image↔image nền cao hơn DINO (ảnh không liên quan đã ~0.5) → ngưỡng cao hơn.
const CLIP_IMAGE_MIN_SIM = 0.75;

// Vector pgvector nhận dạng literal text '[v1,v2,...]' khi cast ::vector.
function toVectorLiteral(embedding) {
  return `[${embedding.join(",")}]`;
}

async function toDinoBuffer(buffer) {
  return sharp(buffer)
    .rotate()
    .resize(DINO_MAX_EDGE, DINO_MAX_EDGE, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 85 })
    .toBuffer();
}

export async function saveDinoEmbedding(mediaId, userId, model, embedding) {
  await dbPool.query(
    `INSERT INTO media_dino_embeddings (media_id, user_id, model, embedding, created_at, updated_at)
     VALUES ($1, $2, $3, $4::vector, NOW(), NOW())
     ON CONFLICT (media_id) DO UPDATE
       SET model = EXCLUDED.model,
           embedding = EXCLUDED.embedding,
           updated_at = NOW()`,
    [mediaId, userId, model, toVectorLiteral(embedding)],
  );
}

/**
 * Tạo descriptor DINOv3 từ buffer ảnh có sẵn (upload) và lưu vào DB.
 * Trả về kết quả ai-service hoặc null nếu pipeline không khả dụng.
 */
export async function embedDinoBuffer({ mediaId, userId, buffer }) {
  const prepared = await toDinoBuffer(buffer);
  const result = await embedImageDino(prepared, "image/webp", `${mediaId}`);
  // Stub = vector ngẫu nhiên → không lưu, để findSimilarMedia fallback CLIP và
  // không phải dọn DB khi bật DINOv3 thật.
  if (!result?.embedding?.length || result.provider === "stub") return null;
  await saveDinoEmbedding(mediaId, userId, result.model, result.embedding);
  return result;
}

/** Fire-and-forget: chạy nền, không chặn response upload. Mọi lỗi chỉ log. */
export function embedDinoInBackground(args) {
  embedDinoBuffer(args).catch((err) => {
    console.warn(`⚠️  DINOv3 embed media ${args.mediaId} lỗi: ${err.message}`);
  });
}

/** Lấy object từ MinIO rồi tạo descriptor — dùng cho backfill / on-demand. */
export async function embedDinoById(mediaId, userId) {
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

  return embedDinoBuffer({ mediaId, userId, buffer });
}

/** Tạo descriptor DINOv3 cho các ảnh của user chưa có (theo lô). Trả thống kê. */
export async function backfillDinoEmbeddings(userId, { limit = 50 } = {}) {
  const result = await dbPool.query(
    `SELECT m.id
     FROM media m
     LEFT JOIN media_dino_embeddings e ON e.media_id = m.id
     WHERE m.user_id = $1
       AND m.media_type = 'photo'
       AND m.deleted_at IS NULL
       AND e.media_id IS NULL
     ORDER BY m.created_at DESC
     LIMIT $2`,
    [userId, limit],
  );

  let embedded = 0;
  let failed = 0;
  for (const row of result.rows) {
    try {
      const done = await embedDinoById(String(row.id), userId);
      if (done) embedded += 1;
      else failed += 1;
    } catch (err) {
      failed += 1;
      console.warn(`⚠️  Backfill DINOv3 ${row.id} lỗi: ${err.message}`);
    }
  }

  const { pending } = await getDinoStats(userId);
  return { embedded, failed, remaining: pending };
}

/** Thống kê số ảnh / số ảnh đã có descriptor DINOv3 của user. */
export async function getDinoStats(userId) {
  const result = await dbPool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(e.media_id)::int AS embedded
     FROM media m
     LEFT JOIN media_dino_embeddings e ON e.media_id = m.id
     WHERE m.user_id = $1
       AND m.media_type = 'photo'
       AND m.deleted_at IS NULL`,
    [userId],
  );
  const row = result.rows[0] ?? { total: 0, embedded: 0 };
  return {
    total: row.total,
    embedded: row.embedded,
    pending: Math.max(0, row.total - row.embedded),
  };
}

// k-NN trong 1 bảng embedding (cùng user, cùng model, bỏ chính ảnh nguồn).
async function nearestIn(table, { mediaId, userId, limit, minSim }) {
  const source = await dbPool.query(
    `SELECT model, embedding::text AS embedding
     FROM ${table}
     WHERE media_id = $1 AND user_id = $2`,
    [mediaId, userId],
  );
  if (source.rows.length === 0) return null;
  const { model, embedding } = source.rows[0];

  const result = await dbPool.query(
    `SELECT m.id, 1 - (e.embedding <=> $3::vector) AS score
     FROM ${table} e
     JOIN media m ON m.id = e.media_id
     WHERE e.user_id = $1
       AND e.media_id <> $2
       AND e.model = $4
       AND m.deleted_at IS NULL
       AND 1 - (e.embedding <=> $3::vector) >= $5
     ORDER BY e.embedding <=> $3::vector
     LIMIT $6`,
    [userId, mediaId, embedding, model, minSim, limit],
  );
  return {
    model,
    hits: result.rows.map((row) => ({
      id: String(row.id),
      score: Number(row.score),
    })),
  };
}

/**
 * Ảnh tương tự của 1 ảnh (Lightbox).
 *
 * - Ưu tiên DINOv3 (`media_dino_embeddings`); ảnh nguồn chưa có → tạo on-demand.
 * - Không tạo được (ai-service tắt / provider lỗi) → fallback CLIP image↔image.
 *
 * @returns {Promise<{ source: "dinov3" | "clip" | null, model: string | null, hits: { id: string, score: number }[] }>}
 */
export async function findSimilarMedia(userId, mediaId, { limit = 12 } = {}) {
  let dino = await nearestIn("media_dino_embeddings", {
    mediaId,
    userId,
    limit,
    minSim: DINO_MIN_SIM,
  });
  if (!dino) {
    try {
      if (await embedDinoById(mediaId, userId)) {
        dino = await nearestIn("media_dino_embeddings", {
          mediaId,
          userId,
          limit,
          minSim: DINO_MIN_SIM,
        });
      }
    } catch (err) {
      console.warn(`⚠️  DINOv3 on-demand ${mediaId} lỗi: ${err.message}`);
    }
  }
  if (dino) return { source: "dinov3", ...dino };

  const clip = await nearestIn("media_embeddings", {
    mediaId,
    userId,
    limit,
    minSim: CLIP_IMAGE_MIN_SIM,
  });
  if (clip) return { source: "clip", ...clip };

  return { source: null, model: null, hits: [] };
}
