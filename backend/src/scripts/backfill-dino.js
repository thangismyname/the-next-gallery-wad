// Backfill DINOv3 descriptor (ảnh tương tự) cho các ảnh cũ chưa có.
//
// Chạy trực tiếp bằng node (không cần HTTP/auth), gọi thẳng service:
//   node src/scripts/backfill-dino.js [userId]
//
// - Không truyền userId → backfill cho mọi user còn ảnh thiếu descriptor.
// - Lặp theo lô cho tới khi remaining = 0, có in tiến độ.
// - Yêu cầu ai-service đang chạy tại AI_SERVICE_URL (similarity/embed),
//   AI_SIMILARITY_PROVIDER=dinov3.
import "../config/env.js";

import { dbPool } from "../config/db.js";
import { backfillDinoEmbeddings } from "../modules/ai/similarity.service.js";

const BATCH_SIZE = 200;
const argUserId = process.argv[2]?.trim();

async function listUsersNeedingBackfill() {
  const conditions = argUserId ? ["m.user_id = $1"] : [];
  const params = argUserId ? [argUserId] : [];

  const result = await dbPool.query(
    `SELECT DISTINCT m.user_id
     FROM media m
     LEFT JOIN media_dino_embeddings e ON e.media_id = m.id
     WHERE m.deleted_at IS NULL
       AND m.media_type = 'photo'
       AND e.media_id IS NULL
       ${conditions.length ? "AND " + conditions[0] : ""}
     ORDER BY m.user_id`,
    params,
  );

  return result.rows.map((row) => String(row.user_id));
}

async function run() {
  const userIds = await listUsersNeedingBackfill();
  console.log(`Danh sách user cần backfill: ${userIds.length}`);

  for (const userId of userIds) {
    let totalEmbedded = 0;
    let pass = 0;
    console.log(`== user ${userId} ==`);

    for (;;) {
      pass += 1;
      const t0 = Date.now();
      const stats = await backfillDinoEmbeddings(userId, { limit: BATCH_SIZE });
      totalEmbedded += stats.embedded;
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(
        `  [pass ${pass}] embedded=${stats.embedded} failed=${stats.failed} ` +
          `remaining=${stats.remaining} (${elapsed}s, tổng ${totalEmbedded})`,
      );
      if (stats.remaining === 0) break;
    }
  }

  const summary = await dbPool.query(
    `SELECT
       COUNT(*)::int AS total_media,
       COUNT(DISTINCT e.media_id)::int AS embedded
     FROM media m
     LEFT JOIN media_dino_embeddings e ON e.media_id = m.id
     WHERE m.deleted_at IS NULL`,
  );
  const s = summary.rows[0];
  console.log(`Done. media=${s.total_media} embedded=${s.embedded}`);
}

run()
  .catch((err) => {
    console.error("Backfill lỗi:", err);
    process.exitCode = 1;
  })
  .finally(() => dbPool.end());