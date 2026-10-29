// Backfill các bản resize (small 200 / med 400 / display ≤2048) cho ảnh và
// video (poster) cũ còn thiếu — file import/upload trước pipeline mới thường
// không có thumbnail, khiến lần đầu mở grid phải decode file gốc ngay lúc xem.
//
// Chạy trực tiếp bằng node (không cần HTTP/auth), gọi thẳng service:
//   node src/scripts/backfill-thumbnails.js [userId]
//
// - Không truyền userId → mọi user. Gồm cả file trong thùng rác (grid trash).
// - File không decode được (hỏng / định dạng lạ) được đếm là failed và bỏ qua.
import "../config/env.js";

import { dbPool } from "../config/db.js";
import { ensureDerivatives } from "../modules/media/media.derivatives.service.js";

const argUserId = process.argv[2]?.trim();
// ensureDerivatives tự giới hạn 2 ảnh decode cùng lúc — gửi dư 1 chút để
// slot không bị trống giữa các ảnh.
const PARALLEL = 4;

async function run() {
  const result = await dbPool.query(
    `SELECT id, user_id, media_type, minio_object, minio_bucket,
            display_object, thumbnail_object, thumbnail_small_object
     FROM media
     WHERE media_type IN ('photo', 'video')
       AND (display_object IS NULL
            OR thumbnail_object IS NULL
            OR thumbnail_small_object IS NULL)
       ${argUserId ? "AND user_id = $1" : ""}
     ORDER BY created_at DESC`,
    argUserId ? [argUserId] : [],
  );
  const rows = result.rows;
  console.log(`Ảnh/video cần tạo thumbnail: ${rows.length}`);

  let done = 0;
  let failed = 0;
  let next = 0;
  const t0 = Date.now();

  async function worker() {
    while (next < rows.length) {
      const row = rows[next++];
      const keys = await ensureDerivatives(row);
      if (keys.display && keys.med && keys.small) done += 1;
      else failed += 1;
      const n = done + failed;
      if (n % 20 === 0 || n === rows.length) {
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`  ${n}/${rows.length} (ok=${done} failed=${failed}, ${elapsed}s)`);
      }
    }
  }

  await Promise.all(Array.from({ length: PARALLEL }, worker));
  console.log(`Done. ok=${done} failed=${failed}`);
}

run()
  .catch((err) => {
    console.error("Backfill lỗi:", err);
    process.exitCode = 1;
  })
  .finally(() => dbPool.end());
