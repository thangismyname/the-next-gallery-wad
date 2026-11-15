// ==========================================================
// Signaling Service — registry kết nối WebSocket (in-memory)
// ==========================================================
// - users: userId → { userId, username, avatarUrl, sockets } (1 user nhiều tab)
//   → presence, sendToUser (album/moment/transfer notify).
// - conns: connId → { connId, ws, userId | null, guestId | null, name }
//   Mỗi socket 1 connId — WebRTC signaling gửi đúng 1 tab, khách (không đăng
//   nhập, vào bằng link/mã) cũng có connId.
// ==========================================================

import { randomUUID } from "node:crypto";
import { buildMessage } from "../protocol.js";

const users = new Map();
const conns = new Map();

// ---- Kết nối (mọi socket, kể cả khách) ----

export function registerConn(ws, { userId = null, guestId = null, name }) {
  const conn = { connId: randomUUID(), ws, userId, guestId, name };
  conns.set(conn.connId, conn);
  return conn;
}

export function removeConn(connId) {
  conns.delete(connId);
}

export function sendToConn(connId, type, payload) {
  const conn = conns.get(connId);
  if (!conn || conn.ws.readyState !== 1) return false;
  conn.ws.send(buildMessage(type, payload));
  return true;
}

// ---- User đã đăng nhập ----

export function registerPeer(userId, username, avatarUrl, ws) {
  const existing = users.get(userId);
  if (existing) {
    existing.username = username;
    existing.avatarUrl = avatarUrl;
    existing.sockets.add(ws);
    return existing;
  }
  const peer = { userId, username, avatarUrl, sockets: new Set([ws]) };
  users.set(userId, peer);
  return peer;
}

export function removePeer(userId, ws) {
  const peer = users.get(userId);
  if (!peer) return null;
  peer.sockets.delete(ws);
  if (peer.sockets.size === 0) users.delete(userId);
  return peer;
}

export function getPeer(userId) {
  return users.get(userId) || null;
}

// Gửi tới mọi socket đang mở của user (nhiều tab + reconnect).
export function sendToUser(userId, type, payload) {
  const peer = users.get(userId);
  if (!peer) return false;
  const msg = buildMessage(type, payload);
  for (const socket of peer.sockets) {
    if (socket.readyState === 1) socket.send(msg);
  }
  return true;
}

export function getStats() {
  return { onlineUsers: users.size, connections: conns.size };
}
