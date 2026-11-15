// Backfill DINOv3 descriptor (ảnh tương tự) cho các ảnh cũ chưa có.
//   node src/scripts/backfill-dino.js [userId]
// Không truyền userId → mọi user. Cần ai-service với AI_SIMILARITY_PROVIDER=dinov3.
import "../config/env.js"; // trước mọi import khác (service đọc env lúc load)
import { backfillDinoEmbeddings } from "../modules/ai/similarity.service.js";
import { runBackfill } from "./backfillRunner.js";

runBackfill({
  field: "embedded",
  batchSize: 200,
  runBatch: backfillDinoEmbeddings,
  listUsers: async (userId) => ({
    sql: `SELECT DISTINCT m.user_id FROM media m
          LEFT JOIN media_dino_embeddings e ON e.media_id = m.id
          WHERE m.deleted_at IS NULL AND m.media_type = 'photo' AND e.media_id IS NULL
            AND ($1::text IS NULL OR m.user_id = $1)
          ORDER BY m.user_id`,
    params: [userId],
  }),
  summarySql: `SELECT COUNT(*)::int AS media, COUNT(DISTINCT e.media_id)::int AS embedded
               FROM media m LEFT JOIN media_dino_embeddings e ON e.media_id = m.id
               WHERE m.deleted_at IS NULL`,
});
