// Backfill media.content_sha256 cho ảnh / video cũ — để upload / import Google Takeout nhận ra
// ảnh đã có (chống trùng). Đọc stream cả file gốc từ MinIO (không giữ trong RAM).
//
//   node src/scripts/backfill-hash.js [userId]
//
// Ảnh trong Thùng rác cũng được tính (import lại không được tạo bản mới của ảnh đã xoá).
// Object hỏng / mất trên MinIO → bỏ qua, chạy lại sẽ thử lại.
import "../config/env.js";

import { createHash } from "crypto";
import { pipeline } from "stream/promises";

import { dbPool } from "../config/db.js";
import { BUCKET_NAME, minioClient } from "../config/minio.js";

const BATCH = 200;
const argUserId = process.argv[2]?.trim() || null;

async function hashObject(bucket, object) {
  const hash = createHash("sha256");
  await pipeline(await minioClient.getObject(bucket, object), hash);
  return hash.digest("hex");
}

async function run() {
  let lastId = "00000000-0000-0000-0000-000000000000";
  let done = 0;
  let failed = 0;
  for (;;) {
    const batch = await dbPool.query(
      `SELECT id, minio_object, minio_bucket
       FROM media
       WHERE content_sha256 IS NULL
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
      try {
        const sha = await hashObject(row.minio_bucket || BUCKET_NAME, row.minio_object);
        await dbPool.query(`UPDATE media SET content_sha256 = $2 WHERE id = $1`, [row.id, sha]);
        done += 1;
      } catch (err) {
        failed += 1;
        console.warn(`⚠️  ${row.id}: ${err.message}`);
      }
    }
    console.log(`… ${done} hashed, ${failed} failed`);
  }
  console.log(`✅ Done: ${done} hashed, ${failed} failed`);
}

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => dbPool.end());
