// Backfill tag nội dung (classification) cho các ảnh cũ chưa gắn tag.
//   node src/scripts/backfill-tags.js [userId]
// Ảnh chưa có embedding CLIP được embed trước (chậm hơn). Không truyền userId →
// mọi user. Cần ai-service (/api/v1/tags/predict).
import "../config/env.js"; // trước mọi import khác (service đọc env lúc load)
import { currentModels } from "../modules/ai/ai.client.js";
import { backfillTags } from "../modules/ai/tagging.service.js";
import { runBackfill } from "./backfillRunner.js";

runBackfill({
  field: "tagged",
  batchSize: 200,
  stopOnZero: true,
  runBatch: backfillTags,
  // Ảnh chưa có tag, hoặc tag do model khác chấm (đổi CLIP / probe).
  listUsers: async (userId) => ({
    sql: `SELECT DISTINCT m.user_id FROM media m
          WHERE m.deleted_at IS NULL AND m.media_type = 'photo'
            AND NOT EXISTS (SELECT 1 FROM media_tags t
                            WHERE t.media_id = m.id AND ($1::text IS NULL OR t.model = $1))
            AND ($2::text IS NULL OR m.user_id = $2)
          ORDER BY m.user_id`,
    params: [(await currentModels()).tagModel, userId],
  }),
  summarySql: `SELECT COUNT(*)::int AS photos,
                      COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM media_tags t WHERE t.media_id = m.id))::int AS tagged
               FROM media m WHERE m.deleted_at IS NULL AND m.media_type = 'photo'`,
});
