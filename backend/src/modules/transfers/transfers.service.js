// Phiên gửi file: tạo (link/QR hoặc gửi thẳng bạn bè), xem, lịch sử, thu hồi,
// mã 6 số, người nhận (bạn bè / khách) + trạng thái nhận.
import { randomInt } from "node:crypto";
import { dbPool } from "../../config/db.js";
import { minioClient } from "../../config/minio.js";
import {
  CODE_CHARS,
  CODE_LENGTH,
  CODE_TTL_MS,
  MAX_RECIPIENTS,
  TRANSFER_TTL_MS,
  partCount,
} from "./transfers.constants.js";
import { hashToken, isTransferOpen, newToken } from "./transfers.access.js";
import { httpError } from "../../middleware/errorHandler.js";
import { purgeRelayObjects } from "./transfers.relay.service.js";
import { logger } from "../../lib/logger.js";

const randomCode = () =>
  Array.from({ length: CODE_LENGTH }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");

// Mã trùng (unique index) → thử mã khác.
async function withUniqueCode(fn, attempts = 8) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn(randomCode());
    } catch (err) {
      if (err.code !== "23505" || !String(err.constraint).includes("code")) throw err;
    }
  }
  throw new Error("Không tạo được mã phiên gửi duy nhất");
}

async function acceptedFriendIds(userId, ids) {
  const { rows } = await dbPool.query(
    `SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END AS id
     FROM friendships
     WHERE status = 'accepted'
       AND ((requester_id = $1 AND addressee_id = ANY($2::text[]))
         OR (addressee_id = $1 AND requester_id = ANY($2::text[])))`,
    [userId, ids],
  );
  return new Set(rows.map((r) => r.id));
}

// Ảnh trong thư viện: lấy tên / MIME / dung lượng THẬT từ DB + MinIO (không tin client).
async function loadLibraryMedia(userId, mediaIds) {
  if (mediaIds.length === 0) return new Map();
  const { rows } = await dbPool.query(
    `SELECT id, original_filename, file_ext, mime_type, minio_bucket, minio_object
     FROM media WHERE user_id = $1 AND deleted_at IS NULL AND id = ANY($2::uuid[])`,
    [userId, mediaIds],
  );
  if (rows.length !== new Set(mediaIds).size) {
    throw httpError(403, "FORBIDDEN_MEDIA", "Có ảnh không thuộc về bạn hoặc đã bị xoá");
  }
  const sizes = await Promise.all(
    rows.map((r) => minioClient.statObject(r.minio_bucket, r.minio_object).then((s) => s.size)),
  );
  return new Map(rows.map((r, i) => [String(r.id), { ...r, size: sizes[i] }]));
}

/**
 * @returns {Promise<{ id: string, token: string | null, recipientIds: string[], libraryMediaIds: string[], deviceFileCount: number }>}
 */
export async function createTransfer(sender, input) {
  const library = await loadLibraryMedia(
    sender.id,
    input.files.filter((f) => f.mediaId).map((f) => f.mediaId),
  );

  let recipients = [];
  if (input.kind === "direct") {
    const unique = [...new Map(input.recipients.map((r) => [r.userId, r])).values()];
    const friends = await acceptedFriendIds(sender.id, unique.map((r) => r.userId));
    if (unique.some((r) => !friends.has(r.userId))) {
      throw httpError(400, "NOT_FRIENDS", "Người nhận phải là bạn bè của bạn");
    }
    recipients = unique;
  }

  const token = input.kind === "link" ? newToken() : null;
  const expiresAt = new Date(Date.now() + TRANSFER_TTL_MS);
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    const insertTransfer = (code) =>
      client.query(
        `INSERT INTO transfers (sender_id, kind, token_hash, code, code_expires_at, max_receivers, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          sender.id,
          input.kind,
          token ? hashToken(token) : null,
          code,
          code ? new Date(Date.now() + CODE_TTL_MS) : null,
          input.kind === "link" ? input.maxReceivers : null,
          expiresAt,
        ],
      );
    // SAVEPOINT để thử lại mã khác trong cùng transaction khi trùng.
    const { rows } =
      input.kind === "link"
        ? await withUniqueCode(async (code) => {
            await client.query("SAVEPOINT pick_code");
            try {
              return await insertTransfer(code);
            } catch (err) {
              await client.query("ROLLBACK TO SAVEPOINT pick_code");
              throw err;
            }
          })
        : await insertTransfer(null);
    const transferId = rows[0].id;

    for (const [position, f] of input.files.entries()) {
      const media = f.mediaId ? library.get(f.mediaId) : null;
      await client.query(
        `INSERT INTO transfer_files (transfer_id, position, name, size, mime, media_id, thumb)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          transferId,
          position,
          media ? media.original_filename || `${media.id}.${media.file_ext || "bin"}` : f.name,
          media ? media.size : f.size,
          media ? media.mime_type || "application/octet-stream" : f.mime,
          media ? media.id : null,
          f.thumb ?? null,
        ],
      );
    }
    for (const r of recipients) {
      await client.query(
        `INSERT INTO transfer_recipients (transfer_id, user_id, wrapped_keys)
         VALUES ($1, $2, $3)`,
        [transferId, r.userId, JSON.stringify(r.wrappedKeys)],
      );
    }
    await client.query("COMMIT");
    return {
      id: transferId,
      token,
      recipientIds: recipients.map((r) => r.userId),
      libraryMediaIds: [...library.keys()],
      deviceFileCount: input.files.filter((f) => !f.mediaId).length,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ---- Đọc ----

const mapFile = (f) => ({
  id: f.id,
  name: f.name,
  size: Number(f.size),
  mime: f.mime,
  source: f.media_id ? "library" : "device",
  thumb: f.thumb,
  relayParts: f.relay_parts,
  partCount: partCount(Number(f.size)),
});

const mapRecipient = (r) => ({
  id: r.id,
  userId: r.user_id,
  name: r.user_name ?? r.display_name ?? null,
  avatarUrl: r.user_image ?? null,
  guest: !r.user_id,
  status: r.status,
  via: r.via,
  bytes: Number(r.bytes),
  startedAt: r.started_at,
  finishedAt: r.finished_at,
});

export async function listFiles(transferId) {
  const { rows } = await dbPool.query(
    `SELECT * FROM transfer_files WHERE transfer_id = $1 ORDER BY position`,
    [transferId],
  );
  return rows;
}

export async function getFile(transferId, fileId) {
  const { rows } = await dbPool.query(
    `SELECT * FROM transfer_files WHERE transfer_id = $1 AND id = $2`,
    [transferId, fileId],
  );
  if (!rows[0]) throw httpError(404, "FILE_NOT_FOUND", "Không tìm thấy file");
  return rows[0];
}

async function listRecipients(transferId) {
  const { rows } = await dbPool.query(
    `SELECT r.*, u.name AS user_name, u.image AS user_image
     FROM transfer_recipients r LEFT JOIN "user" u ON u.id = r.user_id
     WHERE r.transfer_id = $1 ORDER BY r.created_at`,
    [transferId],
  );
  return rows.map(mapRecipient);
}

async function getSender(userId) {
  const { rows } = await dbPool.query(`SELECT id, name, image FROM "user" WHERE id = $1`, [userId]);
  const u = rows[0];
  return u ? { id: u.id, name: u.name, avatarUrl: u.image ?? null } : null;
}

/** Chi tiết phiên theo vai trò — sender thấy mã + danh sách người nhận. */
export async function getTransferDetail({ transfer, role, recipient }, { hostOnline }) {
  const [files, sender] = await Promise.all([listFiles(transfer.id), getSender(transfer.sender_id)]);
  const codeAlive =
    transfer.code && transfer.code_expires_at && new Date(transfer.code_expires_at) > new Date();
  return {
    id: transfer.id,
    kind: transfer.kind,
    role,
    sender,
    createdAt: transfer.created_at,
    expiresAt: transfer.expires_at,
    open: isTransferOpen(transfer),
    maxReceivers: transfer.max_receivers,
    hostOnline,
    files: files.map(mapFile),
    code:
      role === "sender" && codeAlive
        ? { value: transfer.code, expiresAt: transfer.code_expires_at }
        : null,
    recipients: role === "sender" ? await listRecipients(transfer.id) : undefined,
    me: recipient
      ? {
          recipientId: recipient.id,
          status: recipient.status,
          wrappedKeys: recipient.wrapped_keys ?? [],
        }
      : null,
  };
}

/** Lịch sử: đã gửi + hộp nhận (bạn bè gửi thẳng). */
export async function listTransfers(userId) {
  const sent = await dbPool.query(
    `SELECT t.id, t.kind, t.created_at, t.expires_at, t.revoked_at, t.purged_at,
            COUNT(f.id)::int AS file_count, COALESCE(SUM(f.size), 0)::bigint AS total_bytes,
            (SELECT COUNT(*) FROM transfer_recipients r WHERE r.transfer_id = t.id)::int AS recipient_count,
            (SELECT COUNT(*) FROM transfer_recipients r WHERE r.transfer_id = t.id AND r.status = 'done')::int AS done_count,
            (SELECT f2.thumb FROM transfer_files f2 WHERE f2.transfer_id = t.id ORDER BY f2.position LIMIT 1) AS cover_thumb
     FROM transfers t LEFT JOIN transfer_files f ON f.transfer_id = t.id
     WHERE t.sender_id = $1
     GROUP BY t.id ORDER BY t.created_at DESC LIMIT 50`,
    [userId],
  );
  const inbox = await dbPool.query(
    `SELECT t.id, t.kind, t.created_at, t.expires_at, t.revoked_at, t.purged_at,
            r.status, r.via, r.wrapped_keys,
            u.id AS sender_id, u.name AS sender_name, u.image AS sender_image,
            (SELECT COUNT(*) FROM transfer_files f WHERE f.transfer_id = t.id)::int AS file_count,
            (SELECT COUNT(*) FROM transfer_files f WHERE f.transfer_id = t.id AND f.media_id IS NOT NULL)::int AS library_count,
            (SELECT f2.thumb FROM transfer_files f2 WHERE f2.transfer_id = t.id ORDER BY f2.position LIMIT 1) AS cover_thumb
     FROM transfer_recipients r
     JOIN transfers t ON t.id = r.transfer_id
     JOIN "user" u ON u.id = t.sender_id
     WHERE r.user_id = $1 AND t.kind = 'direct'
     ORDER BY t.created_at DESC LIMIT 50`,
    [userId],
  );
  const open = (t) => isTransferOpen(t);
  return {
    sent: sent.rows.map((t) => ({
      id: t.id,
      kind: t.kind,
      createdAt: t.created_at,
      expiresAt: t.expires_at,
      open: open(t),
      fileCount: t.file_count,
      totalBytes: Number(t.total_bytes),
      recipientCount: t.recipient_count,
      doneCount: t.done_count,
      coverThumb: t.cover_thumb,
    })),
    inbox: inbox.rows.map((t) => ({
      id: t.id,
      createdAt: t.created_at,
      expiresAt: t.expires_at,
      open: open(t),
      status: t.status,
      via: t.via,
      fileCount: t.file_count,
      libraryCount: t.library_count,
      wrappedKeys: t.wrapped_keys ?? [],
      coverThumb: t.cover_thumb,
      sender: { id: t.sender_id, name: t.sender_name, avatarUrl: t.sender_image ?? null },
    })),
  };
}

// ---- Thay đổi ----

export async function revokeTransfer(userId, transferId) {
  const { rows } = await dbPool.query(
    `UPDATE transfers SET revoked_at = COALESCE(revoked_at, NOW()), code = NULL
     WHERE id = $1 AND sender_id = $2 RETURNING id`,
    [transferId, userId],
  );
  if (!rows[0]) throw httpError(404, "TRANSFER_NOT_FOUND", "Không tìm thấy phiên gửi");
  await purgeRelayObjects(transferId);
}

/** Mã 6 số mới (10 phút) cho phiên link đang mở. */
export async function refreshCode(userId, transferId) {
  const { rows } = await dbPool.query(
    `SELECT * FROM transfers WHERE id = $1 AND sender_id = $2 AND kind = 'link'`,
    [transferId, userId],
  );
  const t = rows[0];
  if (!t) throw httpError(404, "TRANSFER_NOT_FOUND", "Không tìm thấy phiên gửi");
  if (!isTransferOpen(t)) throw httpError(410, "TRANSFER_CLOSED", "Phiên gửi đã đóng");
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  const value = await withUniqueCode((code) =>
    dbPool
      .query(`UPDATE transfers SET code = $1, code_expires_at = $2 WHERE id = $3`, [
        code,
        expiresAt,
        transferId,
      ])
      .then(() => code),
  );
  return { value, expiresAt };
}

async function countGuests(transferId) {
  const { rows } = await dbPool.query(
    `SELECT COUNT(*)::int AS n FROM transfer_recipients WHERE transfer_id = $1`,
    [transferId],
  );
  return rows[0].n;
}

function assertRoom(transfer, current) {
  const limit = transfer.max_receivers ?? MAX_RECIPIENTS;
  if (current >= limit) throw httpError(409, "TRANSFER_FULL", "Phiên gửi đã đủ người nhận");
}

/**
 * Nhập mã 6 số → token riêng cho khách này (mã sống ngắn, token sống theo phiên).
 * Khoá giải mã KHÔNG đi kèm — lấy trực tiếp từ người gửi qua ECDH khi họ online.
 */
export async function redeemCode(code) {
  const { rows } = await dbPool.query(
    `SELECT * FROM transfers WHERE code = $1 AND code_expires_at > NOW()`,
    [code],
  );
  const t = rows[0];
  if (!t || !isTransferOpen(t)) throw httpError(404, "CODE_NOT_FOUND", "Mã không đúng hoặc đã hết hạn");
  assertRoom(t, await countGuests(t.id));
  const token = newToken();
  await dbPool.query(
    `INSERT INTO transfer_recipients (transfer_id, guest_id, access_hash) VALUES ($1, $2, $3)`,
    [t.id, `code:${hashToken(token).slice(0, 16)}`, hashToken(token)],
  );
  return { transferId: t.id, token };
}

/**
 * Người nhận qua link vào phiên → dòng transfer_recipients (để đếm giới hạn +
 * thống kê). User đăng nhập gộp theo user_id, khách theo guestId (localStorage).
 */
export async function ensureLinkRecipient(access, { userId, guestId, name }) {
  if (access.recipient) {
    if (name && !access.recipient.user_id && access.recipient.display_name !== name) {
      await dbPool.query(`UPDATE transfer_recipients SET display_name = $2 WHERE id = $1`, [
        access.recipient.id,
        name,
      ]);
    }
    return access.recipient;
  }
  const key = userId ? ["user_id", userId] : ["guest_id", guestId];
  const existing = await dbPool.query(
    `SELECT * FROM transfer_recipients WHERE transfer_id = $1 AND ${key[0]} = $2`,
    [access.transfer.id, key[1]],
  );
  if (existing.rows[0]) return existing.rows[0];
  assertRoom(access.transfer, await countGuests(access.transfer.id));
  const { rows } = await dbPool.query(
    `INSERT INTO transfer_recipients (transfer_id, ${key[0]}, display_name)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING RETURNING *`,
    [access.transfer.id, key[1], name ?? null],
  );
  if (rows[0]) return rows[0];
  const again = await dbPool.query(
    `SELECT * FROM transfer_recipients WHERE transfer_id = $1 AND ${key[0]} = $2`,
    [access.transfer.id, key[1]],
  );
  return again.rows[0];
}

const STATUS_RANK = { pending: 0, receiving: 1, failed: 2, declined: 2, done: 3 };

/** Người nhận báo tiến độ (WS xfer:report) — chỉ tiến, không lùi trạng thái. */
export async function reportRecipient(recipientId, { status, via, bytes }) {
  const { rows } = await dbPool.query(
    `SELECT status FROM transfer_recipients WHERE id = $1`,
    [recipientId],
  );
  const current = rows[0];
  if (!current) return null;
  const next =
    status && STATUS_RANK[status] >= STATUS_RANK[current.status] ? status : current.status;
  const result = await dbPool.query(
    `UPDATE transfer_recipients SET
       status = $2::varchar,
       via = COALESCE($3::varchar, via),
       bytes = GREATEST(bytes, $4::bigint),
       started_at = COALESCE(started_at, NOW()),
       finished_at = CASE WHEN $2::varchar IN ('done', 'failed', 'declined') THEN COALESCE(finished_at, NOW()) ELSE finished_at END
     WHERE id = $1 RETURNING *`,
    [recipientId, next, via ?? null, Math.max(0, Math.floor(bytes ?? 0))],
  );
  return result.rows[0] ? mapRecipient(result.rows[0]) : null;
}

export async function markRecipientsCopied(transferId, userIds) {
  if (userIds.length === 0) return;
  await dbPool.query(
    `UPDATE transfer_recipients SET status = 'done', via = 'copy', started_at = NOW(), finished_at = NOW()
     WHERE transfer_id = $1 AND user_id = ANY($2::text[])`,
    [transferId, userIds],
  );
}

/** Hết hạn → xoá file relay (giữ dòng DB làm lịch sử / thống kê). */
export async function purgeExpiredTransfers() {
  const { rows } = await dbPool.query(
    `SELECT id FROM transfers
     WHERE purged_at IS NULL AND (expires_at < NOW() OR revoked_at IS NOT NULL)
     LIMIT 100`,
  );
  for (const { id } of rows) {
    await purgeRelayObjects(id).catch((err) =>
      logger.error({ err }, `[transfers] purge ${id} failed`),
    );
  }
  return rows.length;
}
