// Backfill YOLO26 object detection cho các ảnh cũ chưa chạy detect.
//   node src/scripts/backfill-detections.js [userId]
// Không truyền userId → mọi user. Cần ai-service (/api/v1/detect/objects).
import "../config/env.js"; // trước mọi import khác (service đọc env lúc load)
import { backfillDetections } from "../modules/ai/detection.service.js";
import { runBackfill } from "./backfillRunner.js";

runBackfill({
  field: "detected",
  batchSize: 25,
  runBatch: backfillDetections,
  listUsers: async (userId) => ({
    sql: `SELECT DISTINCT m.user_id FROM media m
          WHERE m.deleted_at IS NULL AND m.media_type = 'photo' AND m.yolo_processed_at IS NULL
            AND ($1::text IS NULL OR m.user_id = $1)
          ORDER BY m.user_id`,
    params: [userId],
  }),
  summarySql: `SELECT COUNT(*)::int AS media,
                      COUNT(yolo_processed_at)::int AS processed,
                      COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM media_detections d WHERE d.media_id = m.id))::int AS with_objects
               FROM media m WHERE m.deleted_at IS NULL AND m.media_type = 'photo'`,
});
