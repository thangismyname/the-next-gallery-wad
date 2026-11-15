// Relay qua server (dự phòng khi P2P/TURN không được): người gửi đẩy từng part
// ĐÃ MÃ HOÁ (AES-GCM, khoá chỉ nằm ở 2 đầu) lên MinIO, người nhận kéo về theo
// part → nối tiếp được khi rớt mạng. Server chỉ thấy bản mã.
import { dbPool } from "../../config/db.js";
import { minioClient, BUCKET_NAME } from "../../config/minio.js";
import {
  RELAY_MAX_BYTES,
  RELAY_PART_MAX_BYTES,
  RELAY_PREFIX,
  partCount,
  relayObjectName,
} from "./transfers.constants.js";
import { httpError } from "../../middleware/errorHandler.js";
import { logger } from "../../lib/logger.js";

/**
 * @returns {Promise<{ relayParts: number, partCount: number }>}
 */
export async function putRelayPart(transferId, file, part, buffer) {
  if (file.media_id) throw httpError(400, "NOT_RELAYABLE", "File trong thư viện không cần relay");
  const total = partCount(Number(file.size));
  if (part >= total) throw httpError(400, "BAD_PART", "Số part không hợp lệ");
  if (!buffer?.length || buffer.length > RELAY_PART_MAX_BYTES) {
    throw httpError(400, "BAD_PART", "Kích thước part không hợp lệ");
  }

  // Hạn mức relay của cả phiên (tính trên bản mã đã lưu, trừ part đang ghi đè).
  const used = await dbPool.query(
    `SELECT COALESCE(SUM(p.size), 0)::bigint AS bytes
     FROM transfer_relay_parts p JOIN transfer_files f ON f.id = p.file_id
     WHERE f.transfer_id = $1 AND NOT (p.file_id = $2 AND p.part = $3)`,
    [transferId, file.id, part],
  );
  if (Number(used.rows[0].bytes) + buffer.length > RELAY_MAX_BYTES) {
    throw httpError(413, "RELAY_QUOTA", "Vượt hạn mức 5 GB gửi qua server");
  }

  await minioClient.putObject(
    BUCKET_NAME,
    relayObjectName(transferId, file.id, part),
    buffer,
    buffer.length,
    { "Content-Type": "application/octet-stream" },
  );
  await dbPool.query(
    `INSERT INTO transfer_relay_parts (file_id, part, size) VALUES ($1, $2, $3)
     ON CONFLICT (file_id, part) DO UPDATE SET size = EXCLUDED.size`,
    [file.id, part, buffer.length],
  );
  const { rows } = await dbPool.query(
    `UPDATE transfer_files
     SET relay_parts = (SELECT COUNT(*) FROM transfer_relay_parts WHERE file_id = $1)
     WHERE id = $1 RETURNING relay_parts`,
    [file.id],
  );
  return { relayParts: rows[0].relay_parts, partCount: total };
}

export async function listRelayParts(fileId) {
  const { rows } = await dbPool.query(
    `SELECT part FROM transfer_relay_parts WHERE file_id = $1 ORDER BY part`,
    [fileId],
  );
  return rows.map((r) => r.part);
}

export async function getRelayPartStream(transferId, fileId, part) {
  const { rows } = await dbPool.query(
    `SELECT size FROM transfer_relay_parts WHERE file_id = $1 AND part = $2`,
    [fileId, part],
  );
  if (!rows[0]) throw httpError(404, "PART_NOT_READY", "Part chưa được tải lên");
  const stream = await minioClient.getObject(BUCKET_NAME, relayObjectName(transferId, fileId, part));
  return { stream, size: rows[0].size };
}

/** Xoá toàn bộ object relay của phiên + đánh dấu đã dọn. */
export async function purgeRelayObjects(transferId) {
  const names = [];
  const stream = minioClient.listObjectsV2(BUCKET_NAME, `${RELAY_PREFIX}${transferId}/`, true);
  for await (const obj of stream) if (obj.name) names.push(obj.name);
  for (let i = 0; i < names.length; i += 1000) {
    await minioClient.removeObjects(BUCKET_NAME, names.slice(i, i + 1000));
  }
  await dbPool.query(
    `DELETE FROM transfer_relay_parts WHERE file_id IN (SELECT id FROM transfer_files WHERE transfer_id = $1)`,
    [transferId],
  );
  await dbPool.query(
    `UPDATE transfer_files SET relay_parts = 0 WHERE transfer_id = $1`,
    [transferId],
  );
  await dbPool.query(
    `UPDATE transfers SET purged_at = NOW()
     WHERE id = $1 AND (expires_at < NOW() OR revoked_at IS NOT NULL)`,
    [transferId],
  );
}

/**
 * Lưới an toàn: lifecycle MinIO tự xoá object relay sau 2 ngày (job dọn trong
 * backend xoá đúng hạn 1 ngày; lifecycle bắt các phiên lỡ bị bỏ sót).
 * Bucket do app sở hữu → ghi đè cấu hình lifecycle là chấp nhận được.
 */
export async function ensureRelayLifecycle() {
  try {
    await minioClient.setBucketLifecycle(BUCKET_NAME, {
      Rule: [
        {
          ID: "tng-transfer-relay",
          Status: "Enabled",
          Filter: { Prefix: RELAY_PREFIX },
          Expiration: { Days: 2 },
        },
      ],
    });
  } catch (err) {
    logger.warn({ err }, "[transfers] Không đặt được lifecycle MinIO");
  }
}
