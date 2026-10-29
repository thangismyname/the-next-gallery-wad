// Backfill YOLO26 object detection cho các ảnh cũ chưa chạy detect.
//
// Chạy trực tiếp bằng node (không cần HTTP/auth), gọi thẳng service:
//   node src/scripts/backfill-detections.js [userId]
//
// - Không truyền userId → backfill cho mọi user còn ảnh chưa detect.
// - Lặp theo lô cho tới khi remaining = 0, có in tiến độ.
// - Yêu cầu ai-service đang chạy tại AI_SERVICE_URL (/api/v1/detect/objects).
import "../config/env.js";

import { dbPool } from "../config/db.js";
import { backfillDetections } from "../modules/ai/detection.service.js";

const BATCH_SIZE = 25;
const argUserId = process.argv[2]?.trim();

async function listUsersNeedingBackfill() {
  const conditions = argUserId ? ["m.user_id = $1"] : [];
  const params = argUserId ? [argUserId] : [];

  const result = await dbPool.query(
    `SELECT DISTINCT m.user_id
     FROM media m
     WHERE m.deleted_at IS NULL
       AND m.media_type = 'photo'
       AND m.yolo_processed_at IS NULL
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
    let totalDetected = 0;
    let pass = 0;
    console.log(`== user ${userId} ==`);

    for (;;) {
      pass += 1;
      const t0 = Date.now();
      const stats = await backfillDetections(userId, { limit: BATCH_SIZE });
      totalDetected += stats.detected;
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(
        `  [pass ${pass}] detected=${stats.detected} failed=${stats.failed} ` +
          `remaining=${stats.remaining} (${elapsed}s, tổng ${totalDetected})`,
      );
      if (stats.remaining === 0) break;
    }
  }

  const summary = await dbPool.query(
    `SELECT
       COUNT(*)::int AS total_media,
       COUNT(yolo_processed_at)::int AS processed,
       COUNT(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM media_detections d WHERE d.media_id = m.id
       ))::int AS with_objects
     FROM media m
     WHERE m.deleted_at IS NULL AND m.media_type = 'photo'`,
  );
  const s = summary.rows[0];
  console.log(
    `Done. media=${s.total_media} processed=${s.processed} with_objects=${s.with_objects}`,
  );
}

run()
  .catch((err) => {
    console.error("Backfill lỗi:", err);
    process.exitCode = 1;
  })
  .finally(() => dbPool.end());
