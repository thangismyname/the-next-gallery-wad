// Backfill ngày chụp (media.taken_at) cho ảnh/video cũ — thư viện nhóm & sắp
// theo ngày chụp, thiếu thì theo ngày tải lên.
//
//   node src/scripts/backfill-taken-at.js [userId]
//
// - Ảnh: đọc EXIF từ 1 MB đầu file trên MinIO (không tải cả ảnh).
// - Video: ffmpeg đọc metadata creation_time qua presigned URL (HTTP Range).
// - Media không có ngày chụp giữ NULL; chạy lại sẽ thử lại các media đó.
import "../config/env.js";

import { dbPool } from "../config/db.js";
import { BUCKET_NAME, minioClient } from "../config/minio.js";
import { readPhotoTakenAt, readVideoTakenAt } from "../modules/media/media.sources.js";

const HEAD_BYTES = 1024 * 1024;
const BATCH = 200;
const argUserId = process.argv[2]?.trim() || null;

async function readHead(bucket, object) {
  const stream = await minioClient.getPartialObject(bucket, object, 0, HEAD_BYTES);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function takenAtOf(row) {
  const bucket = row.minio_bucket || BUCKET_NAME;
  if (row.media_type === "video") {
    return readVideoTakenAt(await minioClient.presignedGetObject(bucket, row.minio_object, 600));
  }
  return readPhotoTakenAt(await readHead(bucket, row.minio_object));
}

async function run() {
  let lastId = "00000000-0000-0000-0000-000000000000";
  let checked = 0;
  let found = 0;
  for (;;) {
    const batch = await dbPool.query(
      `SELECT id, media_type, minio_object, minio_bucket
       FROM media
       WHERE taken_at IS NULL
         AND deleted_at IS NULL
         AND minio_object IS NOT NULL
         AND id > $1
         AND ($2::text IS NULL OR user_id = $2)
       ORDER BY id
       LIMIT ${BATCH}`,
      [lastId, argUserId],
    );
    if (batch.rows.length === 0) break;
    for (const row of batch.rows) {
      lastId = row.id;
      checked += 1;
      try {
        const takenAt = await takenAtOf(row);
        if (takenAt) {
          await dbPool.query(`UPDATE media SET taken_at = $2 WHERE id = $1`, [row.id, takenAt]);
          found += 1;
        }
      } catch (err) {
        console.warn(`  ! ${row.id}: ${err.message}`);
      }
    }
    console.log(`  đã kiểm tra ${checked} · có ngày chụp ${found}`);
  }
  console.log(`Done. checked=${checked} found=${found}`);
}

run()
  .catch((err) => {
    console.error("Backfill lỗi:", err);
    process.exitCode = 1;
  })
  .finally(() => dbPool.end());
