// ==========================================================
// Friends Service — bạn bè, lời mời (đến / đã gửi), tìm người, link mời
// ==========================================================

import crypto from "crypto";
import { dbPool } from "../../config/db.js";
import { httpError } from "../../middleware/errorHandler.js";

// Dùng chung secret với Better Auth (lib/auth.js đã bắt buộc biến này tồn tại).
const SECRET = process.env.BETTER_AUTH_SECRET;

// Thời gian hiệu lực của link mời kết bạn (7 ngày)
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Tìm theo tên: tối đa 8 người, từ khoá ≥ 2 ký tự. */
const SEARCH_LIMIT = 8;
const NAME_MIN_CHARS = 2;

// ---- Token helpers (HMAC-signed invite link, stateless) ----

function sign(payload) {
  return crypto
    .createHmac("sha256", SECRET)
    .update(payload)
    .digest("base64url");
}

function encodeToken(payload) {
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  return `${encoded}.${sign(payload)}`;
}

function decodeToken(token) {
  if (!token || typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const encoded = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const payload = Buffer.from(encoded, "base64url").toString("utf8");
  const expected = sign(payload);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  return payload;
}

// ---- Lists ----

export async function listFriends(userId) {
  const result = await dbPool.query(
    `SELECT u.id, u.name, u.email, u.image,
            COALESCE(f.responded_at, f.created_at) AS since
     FROM friendships f
     JOIN "user" u ON u.id = CASE
       WHEN f.requester_id = $1 THEN f.addressee_id
       ELSE f.requester_id
     END
     WHERE (f.requester_id = $1 OR f.addressee_id = $1)
       AND f.status = 'accepted'
     ORDER BY lower(u.name)`,
    [userId],
  );
  return result.rows;
}

/** Lời mời người khác gửi tới mình (đang chờ). */
export async function listFriendRequests(userId) {
  const result = await dbPool.query(
    `SELECT f.id, u.id AS user_id, u.name, u.email, u.image, f.created_at
     FROM friendships f
     JOIN "user" u ON u.id = f.requester_id
     WHERE f.addressee_id = $1 AND f.status = 'pending'
     ORDER BY f.created_at DESC`,
    [userId],
  );
  return result.rows;
}

/** Lời mời mình đã gửi, người kia chưa trả lời. */
export async function listSentRequests(userId) {
  const result = await dbPool.query(
    `SELECT f.id, u.id AS user_id, u.name, u.email, u.image, f.created_at
     FROM friendships f
     JOIN "user" u ON u.id = f.addressee_id
     WHERE f.requester_id = $1 AND f.status = 'pending'
     ORDER BY f.created_at DESC`,
    [userId],
  );
  return result.rows;
}

// ---- Quan hệ giữa 2 người ----

async function relationshipRow(userId, otherId) {
  const { rows } = await dbPool.query(
    `SELECT id, requester_id, addressee_id, status
     FROM friendships
     WHERE (requester_id = $1 AND addressee_id = $2)
        OR (requester_id = $2 AND addressee_id = $1)
     LIMIT 1`,
    [userId, otherId],
  );
  return rows[0] ?? null;
}

function relationshipOf(row, otherId) {
  if (!row) return "none";
  if (row.status === "accepted") return "friends";
  return row.requester_id === otherId ? "pending_inbound" : "pending_outbound";
}

/** "thang@gmail.com" → "th•••@gmail.com" — tìm theo tên không lộ email người lạ. */
export function maskEmail(email) {
  const [local, domain] = String(email || "").split("@");
  if (!domain) return "";
  return `${local.slice(0, 2)}•••@${domain}`;
}

// ---- Tìm người (không gửi lời mời) ----

/**
 * Đúng email → 1 người (thấy email đầy đủ). Tên (≥ 2 ký tự) → tối đa 8 người
 * có tên chứa từ khoá, tên bắt đầu bằng từ khoá lên trước; email bị che.
 * Không trả chính mình.
 */
export async function searchUsers(userId, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) throw httpError(400, "EMPTY_QUERY", "Vui lòng nhập tên hoặc email");

  const byEmail = q.includes("@");
  if (!byEmail && q.length < NAME_MIN_CHARS) return [];
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const { rows } = await dbPool.query(
    byEmail
      ? `SELECT id, name, email, image, true AS exact FROM "user"
         WHERE lower(email) = $1 AND id <> $2 LIMIT 1`
      : `SELECT id, name, email, image, lower(email) = $1 AS exact FROM "user"
         WHERE id <> $2 AND (lower(email) = $1 OR lower(name) LIKE $3)
         ORDER BY (lower(email) = $1) DESC, (lower(name) LIKE $4) DESC, lower(name)
         LIMIT ${SEARCH_LIMIT}`,
    byEmail ? [q, userId] : [q, userId, pattern, `${pattern.slice(1)}`],
  );
  if (rows.length === 0) return [];

  const rel = await dbPool.query(
    `SELECT id, requester_id, addressee_id, status FROM friendships
     WHERE (requester_id = $1 AND addressee_id = ANY($2::text[]))
        OR (addressee_id = $1 AND requester_id = ANY($2::text[]))`,
    [userId, rows.map((r) => r.id)],
  );
  const byOther = new Map(
    rel.rows.map((r) => [r.requester_id === userId ? r.addressee_id : r.requester_id, r]),
  );
  return rows.map((u) => {
    const row = byOther.get(u.id);
    const relationship = relationshipOf(row, u.id);
    return {
      id: u.id,
      name: u.name,
      image: u.image,
      // Bạn bè / tìm đúng email → email thật; người lạ tìm theo tên → che.
      email: u.exact || relationship === "friends" ? u.email : maskEmail(u.email),
      relationship,
      requestId: row && row.status === "pending" ? row.id : null,
    };
  });
}

// ---- Gửi lời mời ----

async function loadUser(id) {
  const { rows } = await dbPool.query(`SELECT id, name, email, image FROM "user" WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

/**
 * Gửi lời mời tới `targetId`. Người kia đã mời mình trước → chấp nhận luôn
 * (`accepted`). Trả kèm `requestId` để FE huỷ / thông báo.
 */
export async function sendRequestTo(userId, targetId) {
  if (targetId === userId) throw httpError(400, "SELF", "Không thể tự thêm chính mình");
  const target = await loadUser(targetId);
  if (!target) throw httpError(404, "USER_NOT_FOUND", "Không tìm thấy người dùng");

  const row = await relationshipRow(userId, targetId);
  if (row?.status === "accepted") return { target, result: "already_friends", requestId: row.id };
  if (row && row.requester_id === targetId) {
    await dbPool.query(
      `UPDATE friendships SET status = 'accepted', responded_at = NOW() WHERE id = $1`,
      [row.id],
    );
    return { target, result: "accepted", requestId: row.id };
  }
  if (row) return { target, result: "pending_outbound", requestId: row.id };

  const { rows } = await dbPool.query(
    `INSERT INTO friendships (requester_id, addressee_id, status)
     VALUES ($1, $2, 'pending') RETURNING id`,
    [userId, targetId],
  );
  return { target, result: "sent", requestId: rows[0].id };
}

/** Bản cũ: gửi theo email / tên chính xác (giữ cho client cũ). */
export async function sendFriendRequest(userId, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) throw httpError(400, "EMPTY_QUERY", "Vui lòng nhập tên hoặc email");
  const { rows } = await dbPool.query(
    `SELECT id FROM "user" WHERE lower(email) = $1 OR lower(name) = $1 LIMIT 1`,
    [q],
  );
  if (!rows[0]) throw httpError(404, "USER_NOT_FOUND", "Không tìm thấy người dùng với tên/email này");
  return sendRequestTo(userId, rows[0].id);
}

// ---- Trả lời / huỷ lời mời ----

export async function respondToRequest(userId, requestId, action) {
  const result = await dbPool.query(
    `SELECT id, requester_id FROM friendships
     WHERE id = $1 AND addressee_id = $2 AND status = 'pending'`,
    [requestId, userId],
  );
  const row = result.rows[0];
  if (!row) return { found: false };

  if (action === "accept") {
    await dbPool.query(
      `UPDATE friendships SET status = 'accepted', responded_at = NOW() WHERE id = $1`,
      [requestId],
    );
  } else {
    await dbPool.query(`DELETE FROM friendships WHERE id = $1`, [requestId]);
  }
  return { found: true, action, friendId: row.requester_id };
}

/** Huỷ lời mời mình đã gửi (người kia chưa trả lời). */
export async function cancelSentRequest(userId, requestId) {
  const { rows } = await dbPool.query(
    `DELETE FROM friendships
     WHERE id = $1 AND requester_id = $2 AND status = 'pending'
     RETURNING addressee_id`,
    [requestId, userId],
  );
  return rows[0]?.addressee_id ?? null;
}

// ---- Link mời (QR) ----

export function generateInviteToken(userId) {
  const issuedAt = Date.now();
  const token = encodeToken(JSON.stringify({ uid: userId, ts: issuedAt }));
  return { token, issuedAt, expiresAt: issuedAt + INVITE_TTL_MS };
}

/** Mở link mời → gửi lời mời tới chủ link (chủ link đã mời mình → thành bạn luôn). */
export async function claimInviteToken(userId, token) {
  const payload = decodeToken(token);
  if (!payload) return { valid: false };

  let data;
  try {
    data = JSON.parse(payload);
  } catch {
    return { valid: false };
  }
  const ownerId = data?.uid;
  if (!ownerId || ownerId === userId) return { valid: false };

  const issuedAt = Number(data?.ts);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > INVITE_TTL_MS) {
    return { valid: false, expired: true };
  }

  try {
    const { target, result, requestId } = await sendRequestTo(userId, ownerId);
    return { valid: true, result, owner: target, requestId };
  } catch (err) {
    if (err.code === "USER_NOT_FOUND") return { valid: false };
    throw err;
  }
}

// ---- Huỷ kết bạn ----

export async function deleteFriend(userId, friendId) {
  const result = await dbPool.query(
    `DELETE FROM friendships
     WHERE (requester_id = $1 AND addressee_id = $2)
        OR (requester_id = $2 AND addressee_id = $1)
     RETURNING id`,
    [userId, friendId],
  );
  return result.rowCount > 0;
}
