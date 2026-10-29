// Backfill tag nội dung (classification) cho các ảnh cũ chưa gắn tag.
//
// Chạy trực tiếp bằng node (không cần HTTP/auth), gọi thẳng service:
//   node src/scripts/backfill-tags.js [userId]
//
// - Không truyền userId → backfill cho mọi user còn ảnh chưa có tag.
// - Ảnh chưa có embedding CLIP được embed trước (chậm hơn).
// - Lặp theo lô cho tới khi remaining = 0 (hoặc 1 lô không gắn được ảnh nào).
// - Yêu cầu ai-service đang chạy tại AI_SERVICE_URL (/api/v1/tags/predict).
import "../config/env.js";

import { dbPool } from "../config/db.js";
import { backfillTags } from "../modules/ai/tagging.service.js";
import { currentModels } from "../modules/ai/ai.client.js";

const BATCH_SIZE = 200;
const argUserId = process.argv[2]?.trim();

// Ảnh chưa có tag, hoặc tag do model khác chấm (đổi CLIP / probe).
async function listUsersNeedingBackfill() {
  const { tagModel } = await currentModels();
  const result = await dbPool.query(
    `SELECT DISTINCT m.user_id
     FROM media m
     WHERE m.deleted_at IS NULL
       AND m.media_type = 'photo'
       AND NOT EXISTS (
         SELECT 1 FROM media_tags t
         WHERE t.media_id = m.id AND ($1::text IS NULL OR t.model = $1)
       )
       AND ($2::text IS NULL OR m.user_id = $2)
     ORDER BY m.user_id`,
    [tagModel, argUserId || null],
  );
  return result.rows.map((row) => String(row.user_id));
}

async function run() {
  const userIds = await listUsersNeedingBackfill();
  console.log(`Danh sách user cần backfill: ${userIds.length}`);

  for (const userId of userIds) {
    let totalTagged = 0;
    let pass = 0;
    console.log(`== user ${userId} ==`);

    for (;;) {
      pass += 1;
      const t0 = Date.now();
      const stats = await backfillTags(userId, { limit: BATCH_SIZE });
      totalTagged += stats.tagged;
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(
        `  [pass ${pass}] tagged=${stats.tagged} failed=${stats.failed} ` +
          `remaining=${stats.remaining} (${elapsed}s, tổng ${totalTagged})`,
      );
      if (stats.remaining === 0) break;
      if (stats.tagged === 0) {
        console.log("  ! Lô không gắn được ảnh nào — kiểm tra ai-service, dừng user này.");
        break;
      }
    }
  }

  const summary = await dbPool.query(
    `SELECT COUNT(*)::int AS photos,
            COUNT(*) FILTER (
              WHERE EXISTS (SELECT 1 FROM media_tags t WHERE t.media_id = m.id)
            )::int AS tagged
     FROM media m
     WHERE m.deleted_at IS NULL AND m.media_type = 'photo'`,
  );
  const s = summary.rows[0];
  console.log(`Done. photos=${s.photos} tagged=${s.tagged}`);
}

run()
  .catch((err) => {
    console.error("Backfill lỗi:", err);
    process.exitCode = 1;
  })
  .finally(() => dbPool.end());
