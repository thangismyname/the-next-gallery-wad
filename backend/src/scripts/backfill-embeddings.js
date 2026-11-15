// Backfill OpenCLIP embeddings cho các ảnh cũ chưa có embedding.
//   node src/scripts/backfill-embeddings.js [userId]
// Đổi model CLIP (AI_CLIP_MODEL) → vector của model cũ cũng được embed lại, rồi
// gắn tag lại. Không truyền userId → mọi user. Cần ai-service (embed/image + embed/text).
import "../config/env.js"; // trước mọi import khác (service đọc env lúc load)
import { currentModels } from "../modules/ai/ai.client.js";
import { backfillEmbeddings } from "../modules/ai/embedding.service.js";
import { runBackfill } from "./backfillRunner.js";

runBackfill({
  field: "embedded",
  batchSize: 200,
  stopOnZero: true,
  runBatch: backfillEmbeddings,
  // Ảnh chưa có embedding, hoặc embedding của model CLIP khác model đang chạy.
  listUsers: async (userId) => ({
    sql: `SELECT DISTINCT m.user_id FROM media m
          LEFT JOIN media_embeddings e ON e.media_id = m.id
          WHERE m.deleted_at IS NULL AND m.media_type = 'photo'
            AND (e.media_id IS NULL OR ($1::text IS NOT NULL AND e.model <> $1))
            AND ($2::text IS NULL OR m.user_id = $2)
          ORDER BY m.user_id`,
    params: [(await currentModels()).clipModel, userId],
  }),
  summarySql: `SELECT COUNT(*)::int AS media, COUNT(DISTINCT e.media_id)::int AS embedded
               FROM media m LEFT JOIN media_embeddings e ON e.media_id = m.id
               WHERE m.deleted_at IS NULL`,
});
