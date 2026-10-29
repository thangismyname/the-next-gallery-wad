// ==========================================================
// Friends Service — Database operations for friend management
// ==========================================================

import crypto from "crypto";
import { dbPool } from "../../config/db.js";

// Dùng chung secret với Better Auth (lib/auth.js đã bắt buộc biến này tồn tại).
const SECRET = process.env.BETTER_AUTH_SECRET;

// Thời gian hiệu lực của link mời kết bạn (7 ngày)
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

// ---- Friends list (both directions, accepted only) ----

export async function listFriends(userId) {
  const result = await dbPool.query(
    `SELECT u.id, u.name, u.email, u.image AS avatar_url,
            f.created_at AS friend_since
     FROM friendships f
     JOIN "user" u ON u.id = CASE
       WHEN f.requester_id = $1 THEN f.addressee_id
       ELSE f.requester_id
     END
     WHERE (f.requester_id = $1 OR f.addressee_id = $1)
       AND f.status = 'accepted'
     ORDER BY f.created_at DESC`,
    [userId],
  );
  return result.rows;
}

// ---- Inbound pending friend requests ----

export async function listFriendRequests(userId) {
  const result = await dbPool.query(
    `SELECT f.id AS id,
            u.name, u.email, u.image AS avatar_url,
            f.created_at AS requested_at
     FROM friendships f
     JOIN "user" u ON u.id = f.requester_id
     WHERE f.addressee_id = $1 AND f.status = 'pending'
     ORDER BY f.created_at DESC`,
    [userId],
  );
  return result.rows;
}

// ---- Search a user by name or email (no request sent) ----

export async function searchUser(userId, query) {
  const targetQuery = String(query || "").trim().toLowerCase();
  if (!targetQuery) {
    throw Object.assign(new Error("Vui lòng nhập tên hoặc email"), {
      status: 400,
    });
  }

  const targetResult = await dbPool.query(
    `SELECT id, name, email, image FROM "user"
     WHERE LOWER(email) = $1 OR LOWER(name) = $1
     LIMIT 1`,
    [targetQuery],
  );
  const target = targetResult.rows[0];
  if (!target) {
    return null;
  }

  let relationship = "none";
  if (target.id === userId) {
    relationship = "self";
  } else {
    const existing = await dbPool.query(
      `SELECT requester_id, addressee_id, status
       FROM friendships
       WHERE (requester_id = $1 AND addressee_id = $2)
          OR (requester_id = $2 AND addressee_id = $1)
       LIMIT 1`,
      [userId, target.id],
    );
    const row = existing.rows[0];
    if (row) {
      if (row.status === "accepted") {
        relationship = "friends";
      } else if (row.requester_id === target.id) {
        relationship = "pending_inbound";
      } else {
        relationship = "pending_outbound";
      }
    }
  }

  return {
    user: {
      id: target.id,
      name: target.name,
      email: target.email,
      avatar_url: target.image,
    },
    relationship,
  };
}

// ---- Send friend request (by name or email → status pending) ----

export async function sendFriendRequest(userId, query) {
  const targetQuery = String(query || "").trim().toLowerCase();
  if (!targetQuery) {
    throw Object.assign(new Error("Vui lòng nhập tên hoặc email"), { status: 400 });
  }

  const targetResult = await dbPool.query(
    `SELECT id, name, email, image FROM "user"
     WHERE LOWER(email) = $1 OR LOWER(name) = $1
     LIMIT 1`,
    [targetQuery],
  );
  const target = targetResult.rows[0];
  if (!target) {
    throw Object.assign(new Error("Không tìm thấy người dùng với tên/email này"), {
      status: 404,
    });
  }
  if (target.id === userId) {
    throw Object.assign(new Error("Không thể tự thêm chính mình"), {
      status: 400,
    });
  }

  const existing = await dbPool.query(
    `SELECT id, requester_id, addressee_id, status
     FROM friendships
     WHERE (requester_id = $1 AND addressee_id = $2)
        OR (requester_id = $2 AND addressee_id = $1)
     LIMIT 1`,
    [userId, target.id],
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    if (row.status === "accepted") {
      return { target, result: "already_friends" };
    }
    // Nếu đối phương đã gửi trước => hiện là request chờ mình accept
    if (row.requester_id === target.id) {
      return { target, result: "pending_inbound" };
    }
    // Mình đã gửi trước đó, vẫn đang chờ
    return { target, result: "pending_outbound" };
  }

  await dbPool.query(
    `INSERT INTO friendships (requester_id, addressee_id, status)
     VALUES ($1, $2, 'pending')`,
    [userId, target.id],
  );

  return { target, result: "sent" };
}

// ---- Accept / decline a pending inbound request ----

export async function respondToRequest(userId, requestId, action) {
  const result = await dbPool.query(
    `SELECT id, requester_id, addressee_id, status
     FROM friendships
     WHERE id = $1 AND addressee_id = $2 AND status = 'pending'`,
    [requestId, userId],
  );
  const row = result.rows[0];
  if (!row) {
    return { found: false };
  }

  if (action === "accept") {
    await dbPool.query(
      `UPDATE friendships SET status = 'accepted', responded_at = NOW() WHERE id = $1`,
      [requestId],
    );
  } else {
    // decline → xóa luôn lời mời
    await dbPool.query(`DELETE FROM friendships WHERE id = $1`, [requestId]);
  }

  return { found: true, action, friendId: row.requester_id };
}

// ---- Generate an invite share token for the current user ----

export function generateInviteToken(userId) {
  const issuedAt = Date.now();
  const token = encodeToken(JSON.stringify({ uid: userId, ts: issuedAt }));
  return { token, issuedAt, expiresAt: issuedAt + INVITE_TTL_MS };
}

// ---- Claim an invite link → send a friend request to the token owner ----

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

  // Hết hạn dựa trên ts ghi trong token
  const issuedAt = Number(data?.ts);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > INVITE_TTL_MS) {
    return { valid: false, expired: true };
  }

  const ownerResult = await dbPool.query(
    `SELECT id, name, email, image FROM "user" WHERE id = $1 LIMIT 1`,
    [ownerId],
  );
  const owner = ownerResult.rows[0];
  if (!owner) return { valid: false };

  const existing = await dbPool.query(
    `SELECT id, requester_id, addressee_id, status
     FROM friendships
     WHERE (requester_id = $1 AND addressee_id = $2)
        OR (requester_id = $2 AND addressee_id = $1)
     LIMIT 1`,
    [userId, ownerId],
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    if (row.status === "accepted") return { valid: true, result: "already_friends", owner };
    if (row.requester_id === ownerId) return { valid: true, result: "pending_inbound", owner };
    return { valid: true, result: "pending_outbound", owner };
  }

  // Chính người quét (userId) trở thành người gửi request tới chủ token
  await dbPool.query(
    `INSERT INTO friendships (requester_id, addressee_id, status)
     VALUES ($1, $2, 'pending')`,
    [userId, ownerId],
  );

  return { valid: true, result: "sent", owner };
}

// ---- Delete / unfriend (either direction) ----

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
