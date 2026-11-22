import { dbPool } from "../../config/db.js";
import { createJobQueue } from "../../lib/jobQueue.js";
import { logger } from "../../lib/logger.js";
import { readAiSourceBuffer } from "../media/media.derivatives.service.js";
import { detectMediaBuffer } from "./detection.service.js";
import { embedMediaBuffer } from "./embedding.service.js";
import { embedDinoBuffer } from "./similarity.service.js";
import { tagMediaIds } from "./tagging.service.js";

/** Photos processed at once (each = CLIP + tags, YOLO, DINOv3 in parallel → ≤ 6 ai-service calls). */
const CONCURRENCY = 2;
/** Fast-lane jobs that may keep their upload buffer in RAM; beyond that the photo is re-read from MinIO. */
const KEEP_BUFFERS = 32;

const log = (what, mediaId) => (err) => logger.warn({ err }, `${what} media ${mediaId} lỗi`);

async function loadBuffer(mediaId, userId) {
  const { rows } = await dbPool.query(
    `SELECT id, user_id, minio_object, minio_bucket, display_object,
            thumbnail_object, thumbnail_small_object, media_type
     FROM media
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [mediaId, userId],
  );
  return rows[0]?.media_type === "photo" ? readAiSourceBuffer(rows[0]) : null;
}

async function runAi({ mediaId, userId, buffer }) {
  const source = buffer ?? (await loadBuffer(mediaId, userId));
  if (!source) return; // deleted / trashed meanwhile, or not a photo
  const args = { mediaId, userId, buffer: source };
  await Promise.all([
    // Có vector CLIP rồi → gắn tag nội dung luôn (không cần đọc lại ảnh).
    embedMediaBuffer(args)
      .then((result) => result && tagMediaIds(userId, [mediaId]))
      .catch(log("Embed/tag", mediaId)),
    detectMediaBuffer(args).catch(log("Detect", mediaId)),
    embedDinoBuffer(args).catch(log("DINO", mediaId)),
  ]);
}

const queue = createJobQueue({
  concurrency: CONCURRENCY,
  run: runAi,
  onError: (err, job) => log("AI", job.mediaId)(err),
});

/**
 * Queue CLIP (+ tags) · YOLO · DINOv3 for an uploaded photo. `bulk` = import lane (served after
 * normal uploads, never holds the buffer). A full queue drops the job — `npm run backfill:*`,
 * Settings → AI processing or the Studio banner pick those photos up later.
 */
export function enqueueMediaAi({ mediaId, userId, buffer = null, bulk = false }) {
  const keep = !bulk && queue.stats().fast < KEEP_BUFFERS;
  const queued = queue.push({ mediaId, userId, buffer: keep ? buffer : null }, bulk ? "bulk" : "fast");
  if (!queued) logger.warn(`AI queue đầy — media ${mediaId} chờ backfill`);
}

export const aiQueueStats = () => queue.stats();

/** Look back this far on startup (older photos: the normal backfills). */
const RESUME_DAYS = 7;
const RESUME_MAX = 5000;

/**
 * The queue lives in memory → a restart drops whatever was waiting. On startup, queue (bulk lane)
 * the recent photos still missing CLIP or YOLO. DINOv3 isn't checked: with the stub provider no
 * vector is ever saved, so every restart would redo everything.
 */
export async function resumePendingAi() {
  const { rows } = await dbPool.query(
    `SELECT m.id, m.user_id FROM media m
     LEFT JOIN media_embeddings e ON e.media_id = m.id
     WHERE m.media_type = 'photo' AND m.deleted_at IS NULL
       AND m.created_at > NOW() - make_interval(days => $1)
       AND (e.media_id IS NULL OR m.yolo_processed_at IS NULL)
     ORDER BY m.created_at DESC
     LIMIT $2`,
    [RESUME_DAYS, RESUME_MAX],
  );
  for (const row of rows) enqueueMediaAi({ mediaId: String(row.id), userId: row.user_id, bulk: true });
  if (rows.length) logger.info(`AI queue: ${rows.length} ảnh gần đây chưa xử lý xong → xếp hàng lại`);
}
