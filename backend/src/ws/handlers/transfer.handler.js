// ==========================================================
// Transfer Handler — File transfer protocol
// ==========================================================
//
// Handles the high-level file transfer protocol messages.
// Note: Actual file bytes travel over WebRTC DataChannels
// (P2P, not through this server). The server only tracks
// transfer state and relays control messages.
// ==========================================================

import { buildMessage } from "../protocol.js";
import { getPeer, sendToUser, getRoom } from "../services/signaling.service.js";
import {
  startTransfer,
  updateFileProgress,
  completeTransfer,
  failTransfer,
  getTransfer,
} from "../services/transfer.service.js";
import { completeShareSession } from "../../modules/share/share.service.js";

function sendError(ws, code, message) {
  if (ws.readyState === 1) {
    ws.send(buildMessage("error", { code, message }));
  }
}

function validatePeersInSameRoom(senderId, receiverId) {
  const sender = getPeer(senderId);
  const receiver = getPeer(receiverId);
  if (!sender || !receiver) return false;
  if (!sender.currentRoomId || !receiver.currentRoomId) return false;
  return sender.currentRoomId === receiver.currentRoomId;
}

// transfer:metadata — sender announces files to receiver
export function handleTransferMetadata(ws, userId, payload = {}) {
  const { to, files, sessionId } = payload;
  if (!to || !Array.isArray(files) || files.length === 0) {
    sendError(ws, "INVALID_PAYLOAD", "Thiếu thông tin file");
    return;
  }

  if (!validatePeersInSameRoom(userId, to)) {
    sendError(ws, "NOT_SAME_ROOM", "Không thể gửi file");
    return;
  }

  // Safely normalize file metadata
  const normalizedFiles = files.map((f) => ({
    id: String(f.id || crypto.randomUUID()),
    name: String(f.name || "unknown"),
    size: Number(f.size) || 0,
    type: String(f.type || "application/octet-stream"),
    checksum: f.checksum || null,
  }));

  // Start tracking the transfer
  startTransfer(sessionId, userId, to, normalizedFiles);

  sendToUser(to, "transfer:metadata", {
    from: userId,
    sessionId,
    files: normalizedFiles,
  });
}

// transfer:accept — receiver accepts the transfer
export function handleTransferAccept(ws, userId, payload = {}) {
  const { sessionId, from } = payload;
  if (!sessionId || !from) {
    sendError(ws, "INVALID_PAYLOAD", "Thiếu sessionId");
    return;
  }

  if (!validatePeersInSameRoom(userId, from)) {
    sendError(ws, "NOT_SAME_ROOM", "Không thể chấp nhận");
    return;
  }

  sendToUser(from, "transfer:accept", {
    from: userId,
    sessionId,
  });
}

// transfer:reject — receiver rejects the transfer
export function handleTransferReject(ws, userId, payload = {}) {
  const { sessionId, from } = payload;
  if (!sessionId || !from) {
    sendError(ws, "INVALID_PAYLOAD", "Thiếu sessionId");
    return;
  }

  if (sessionId) {
    failTransfer(sessionId);
  }

  sendToUser(from, "transfer:reject", {
    from: userId,
    sessionId,
  });
}

// transfer:progress — update transfer progress
export function handleTransferProgress(ws, userId, payload = {}) {
  const { sessionId, fileId, sent, total, to } = payload;
  if (!sessionId || !fileId) return;

  updateFileProgress(sessionId, fileId, Number(sent) || 0);

  // Optionally forward progress to receiver
  if (to) {
    sendToUser(to, "transfer:progress", {
      from: userId,
      sessionId,
      fileId,
      sent: Number(sent) || 0,
      total: Number(total) || 0,
    });
  }
}

// transfer:complete — mark transfer as complete
export async function handleTransferComplete(ws, userId, payload = {}) {
  const { sessionId, to } = payload;
  if (!sessionId) return;

  completeTransfer(sessionId);

  // Mark session as complete in DB
  try {
    // Chỉ host (sender) mới đóng được phiên trong DB.
    await completeShareSession(sessionId, userId);
  } catch (err) {
    console.error("[ws] Failed to complete share session in DB:", err.message);
  }

  if (to) {
    sendToUser(to, "transfer:complete", {
      from: userId,
      sessionId,
    });
  }
}
