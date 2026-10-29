// Backfill OpenCLIP embeddings cho các ảnh cũ chưa có embedding.
//
// Chạy trực tiếp bằng node (không cần HTTP/auth), gọi thẳng service:
//   node src/scripts/backfill-embeddings.js [userId]
//
// - Đổi model CLIP (AI_CLIP_MODEL, vd CLIP đa ngôn ngữ) → vector của model cũ
//   cũng được embed lại, rồi gắn tag lại.
// - Không truyền userId → backfill cho mọi user còn ảnh thiếu embedding.
// - Lặp theo lô cho tới khi remaining = 0, có in tiến độ.
// - Yêu cầu ai-service đang chạy tại AI_SERVICE_URL (embed/image + embed/text).
import "../config/env.js";

import { dbPool } from "../config/db.js";
import { backfillEmbeddings } from "../modules/ai/embedding.service.js";
import { currentModels } from "../modules/ai/ai.client.js";

const BATCH_SIZE = 200;
const argUserId = process.argv[2]?.trim();

// Ảnh chưa có embedding, hoặc embedding của model CLIP khác model đang chạy.
async function listUsersNeedingBackfill() {
  const { clipModel } = await currentModels();
  const result = await dbPool.query(
    `SELECT DISTINCT m.user_id
     FROM media m
     LEFT JOIN media_embeddings e ON e.media_id = m.id
     WHERE m.deleted_at IS NULL
       AND m.media_type = 'photo'
       AND (e.media_id IS NULL OR ($1::text IS NOT NULL AND e.model <> $1))
       AND ($2::text IS NULL OR m.user_id = $2)
     ORDER BY m.user_id`,
    [clipModel, argUserId || null],
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
      const stats = await backfillEmbeddings(userId, { limit: BATCH_SIZE });
      totalEmbedded += stats.embedded;
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(
        `  [pass ${pass}] embedded=${stats.embedded} failed=${stats.failed} ` +
          `remaining=${stats.remaining} (${elapsed}s, tổng ${totalEmbedded})`,
      );
      if (stats.remaining === 0) break;
      if (stats.embedded === 0) {
        console.log("  ! Lô không embed được ảnh nào — kiểm tra ai-service, dừng user này.");
        break;
      }
    }
  }

  const summary = await dbPool.query(
    `SELECT
       COUNT(*)::int AS total_media,
       COUNT(DISTINCT e.media_id)::int AS embedded
     FROM media m
     LEFT JOIN media_embeddings e ON e.media_id = m.id
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