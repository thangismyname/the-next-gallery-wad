// ==========================================================
// Share Service — Database operations for share sessions
// ==========================================================

import { dbPool } from "../../config/db.js";
import {
  createRoom,
  getPeer,
  getRoom,
  sendToUser,
} from "../../ws/services/signaling.service.js";

function httpError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

// ---- Room / session management ----

export async function createShareSession(hostUserId, mediaIds = []) {
  const roomCode = await generateUniqueRoomCode();

  const result = await dbPool.query(
    `INSERT INTO share_sessions (room_code, host_user_id, media_ids, status, expires_at)
     VALUES ($1, $2, $3, 'active', NOW() + INTERVAL '1 hour')
     RETURNING id, room_code, host_user_id, media_ids, status, created_at, expires_at`,
    [roomCode, hostUserId, mediaIds],
  );

  return result.rows[0];
}

// Chỉ host của phiên mới xem được chi tiết.
export async function getShareSession(sessionId, hostUserId) {
  const result = await dbPool.query(
    `SELECT id, room_code, host_user_id, media_ids, status, transfer_mode, created_at, expires_at
     FROM share_sessions WHERE id = $1 AND host_user_id = $2`,
    [sessionId, hostUserId],
  );
  return result.rows[0] || null;
}

export async function getShareSessionsByUser(userId) {
  const result = await dbPool.query(
    `SELECT id, room_code, host_user_id, media_ids, status, transfer_mode, created_at, expires_at
     FROM share_sessions
     WHERE host_user_id = $1
     ORDER BY created_at DESC LIMIT 50`,
    [userId],
  );
  return result.rows;
}

// Chỉ host của phiên mới đánh dấu hoàn tất được.
export async function completeShareSession(sessionId, hostUserId) {
  const result = await dbPool.query(
    `UPDATE share_sessions SET status = 'completed'
     WHERE id = $1 AND host_user_id = $2 RETURNING id`,
    [sessionId, hostUserId],
  );
  return result.rows[0] || null;
}

// ---- Receivers ----

export async function addReceiver(sessionId, userId, username = null) {
  const result = await dbPool.query(
    `INSERT INTO share_session_receivers (session_id, user_id, username, status)
     VALUES ($1, $2, $3, 'pending')
     ON CONFLICT (session_id, user_id) DO NOTHING
     RETURNING id`,
    [sessionId, userId, username],
  );
  return result.rows[0] || null;
}

export async function getReceivers(sessionId) {
  const result = await dbPool.query(
    `SELECT r.user_id, r.username, r.status, r.created_at, r.completed_at,
            COALESCE(u.name, r.username) AS display_name, u.image AS avatar_url
     FROM share_session_receivers r
     LEFT JOIN "user" u ON u.id = r.user_id
     WHERE r.session_id = $1`,
    [sessionId],
  );
  return result.rows;
}

// ---- Gửi media cho bạn bè (POST /api/share/to-friends) ----

// Giữ lại các id trong `mediaIds` thuộc về user và chưa bị xoá.
async function filterOwnedMediaIds(userId, mediaIds) {
  const result = await dbPool.query(
    `SELECT id FROM media
     WHERE user_id = $1 AND deleted_at IS NULL AND id = ANY($2::uuid[])`,
    [userId, mediaIds],
  );
  return result.rows.map((row) => String(row.id));
}

// Giữ lại các id trong `friendIds` đã là bạn bè (accepted) của user.
async function filterAcceptedFriendIds(userId, friendIds) {
  const result = await dbPool.query(
    `SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END AS friend_id
     FROM friendships
     WHERE status = 'accepted'
       AND (
         (requester_id = $1 AND addressee_id = ANY($2::text[]))
         OR (addressee_id = $1 AND requester_id = ANY($2::text[]))
       )`,
    [userId, friendIds],
  );
  return result.rows.map((row) => row.friend_id);
}

// Phòng signaling để receiver join: ưu tiên phòng đang mở của sender (đang ở
// ShareDialog); nếu chưa có thì tạo mới. null nếu sender không online qua WS.
function getOrCreateSenderRoom(userId, mediaIds) {
  const senderPeer = getPeer(userId);
  if (senderPeer?.currentRoomId) {
    const room = getRoom(senderPeer.currentRoomId);
    if (room && Date.now() < room.expiresAt) return room;
  }
  return createRoom(userId, mediaIds);
}

export async function shareToFriends(sender, mediaIds, friendIds) {
  const uniqueMediaIds = [...new Set(mediaIds)];
  const ownedMediaIds = await filterOwnedMediaIds(sender.id, uniqueMediaIds);
  if (ownedMediaIds.length !== uniqueMediaIds.length) {
    throw httpError(403, "FORBIDDEN_MEDIA", "Có ảnh không thuộc về bạn hoặc đã bị xoá");
  }

  const receiverIds = await filterAcceptedFriendIds(sender.id, [...new Set(friendIds)]);
  if (receiverIds.length === 0) {
    throw httpError(400, "NOT_FRIENDS", "Người nhận phải là bạn bè của bạn");
  }

  const session = await createShareSession(sender.id, ownedMediaIds);
  for (const receiverId of receiverIds) {
    await addReceiver(session.id, receiverId, null);
  }

  // Realtime invite: gửi qua WS tới bạn bè đang online.
  const room = getOrCreateSenderRoom(sender.id, ownedMediaIds);
  if (room) {
    const payload = {
      sessionId: session.id,
      roomCode: room.code,
      senderId: sender.id,
      senderName: sender.name || sender.email,
      senderAvatar: sender.image ?? null,
      mediaCount: ownedMediaIds.length,
      expiresAt: room.expiresAt,
    };
    for (const receiverId of receiverIds) {
      sendToUser(receiverId, "share:invite", payload);
    }
  }

  return { sessionId: session.id, receiverCount: receiverIds.length };
}

// ---- Friends ----

export async function getFriends(userId) {
  const result = await dbPool.query(
    `SELECT u.id, u.name, u.email, u.image AS avatar_url
     FROM friendships f
     JOIN "user" u ON u.id = CASE
       WHEN f.requester_id = $1 THEN f.addressee_id
       ELSE f.requester_id
     END
     WHERE (f.requester_id = $1 OR f.addressee_id = $1)
       AND f.status = 'accepted'`,
    [userId],
  );
  return result.rows;
}

// ---- Room code generation with uniqueness check ----

const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

async function generateUniqueRoomCode(maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    let code = "";
    for (let j = 0; j < 6; j++) {
      code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
    }

    const { rows } = await dbPool.query(
      `SELECT 1 FROM share_sessions WHERE room_code = $1 LIMIT 1`,
      [code],
    );

    if (rows.length === 0) return code;
  }
  throw new Error("Không thể tạo mã phòng duy nhất sau nhiều lần thử");
}