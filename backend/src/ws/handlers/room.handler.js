// ==========================================================
// Room Handler — Room create/join/leave
// ==========================================================

import { buildMessage } from "../protocol.js";
import {
  createRoom,
  joinRoom,
  leaveRoom,
  getPeer,
  getRoom,
  sendToUser,
} from "../services/signaling.service.js";
let createShareSessionDb;
try {
  const mod = await import("../../modules/share/share.service.js");
  createShareSessionDb = mod.createShareSession;
} catch {
  // Table may not exist yet — DB persistence is optional
  createShareSessionDb = null;
}

function sendError(ws, code, message) {
  if (ws.readyState === 1) {
    ws.send(buildMessage("error", { code, message }));
  }
}

// room:create — sender creates a share room
export async function handleCreateRoom(ws, userId, payload = {}) {
  const mediaIds = Array.isArray(payload.mediaIds) ? payload.mediaIds : [];

  try {
    // Create in-memory signaling room
    const room = createRoom(userId, mediaIds);
    if (!room) {
      sendError(ws, "ROOM_CREATE_FAILED", "Không thể tạo phòng");
      return;
    }

    // Persist to DB if table exists
    let sessionId = null;
    if (createShareSessionDb) {
      try {
        const session = await createShareSessionDb(userId, mediaIds);
        sessionId = session.id;
      } catch (err) {
        console.warn("[ws] Could not persist share session:", err.message);
      }
    }

    ws.send(buildMessage("room:created", {
      roomId: room.id,
      roomCode: room.code,
      sessionId,
      expiresAt: room.expiresAt,
      peerCount: 1,
    }));
  } catch (err) {
    console.error("[ws] room:create failed:", err);
    sendError(ws, "ROOM_CREATE_FAILED", "Lỗi server khi tạo phòng");
  }
}

// room:join — receiver joins by room code
export async function handleJoinRoom(ws, userId, payload = {}) {
  const roomCode = (payload.roomCode || "").trim().toUpperCase();
  if (!roomCode) {
    sendError(ws, "INVALID_CODE", "Thiếu mã phòng");
    return;
  }

  const result = joinRoom(roomCode, userId);
  if (result.error) {
    const messages = {
      USER_NOT_REGISTERED: "Người dùng chưa đăng ký",
      ROOM_NOT_FOUND: "Không tìm thấy phòng",
      ROOM_EXPIRED: "Phòng đã hết hạn",
      CANNOT_JOIN_OWN_ROOM:
        "Không thể vào phòng của chính bạn — hãy đăng nhập tài khoản khác để nhận file",
    };
    sendError(ws, result.error, messages[result.error] || "Lỗi khi vào phòng");
    return;
  }

  ws.send(buildMessage("room:joined", {
    room: result.room,
    peers: result.peers,
  }));
}

// room:leave — leave the room
export function handleRoomLeave(ws, userId, payload = {}) {
  const peer = getPeer(userId);
  if (!peer) return;

  const roomId = peer.currentRoomId;
  if (roomId) {
    leaveRoom(roomId, userId);
  }
}

// Get current room info (on reconnect)
export function getCurrentRoomInfo(userId) {
  const peer = getPeer(userId);
  if (!peer?.currentRoomId) return null;

  const room = getRoom(peer.currentRoomId);
  if (!room) return null;

  const peers = [];
  for (const [peerId, p] of room.peers) {
    if (peerId !== userId) {
      peers.push({ userId: peerId, username: p.username, avatarUrl: p.avatarUrl });
    }
  }

  return {
    room: {
      id: room.id,
      code: room.code,
      hostUserId: room.hostUserId,
      mediaIds: room.mediaIds,
      expiresAt: room.expiresAt,
    },
    peers,
  };
}
