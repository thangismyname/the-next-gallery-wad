// ==========================================================
// Transfer hub — ai đang "phát" (host) / đang nhận 1 phiên gửi (in-memory)
// ==========================================================
// - host: socket của người gửi đang mở trang → phục vụ P2P.
// - receivers: các socket người nhận đã vào phiên (bạn bè / khách).
// Server chỉ chuyển tiếp tín hiệu WebRTC giữa host ↔ receiver của CÙNG phiên.
// ==========================================================

import { sendToConn } from "./signaling.service.js";

const hosts = new Map(); // transferId → connId
const rooms = new Map(); // transferId → Map<connId, { recipientId, name, guest }>
const byConn = new Map(); // connId → Set<transferId>

function track(connId, transferId) {
  let set = byConn.get(connId);
  if (!set) byConn.set(connId, (set = new Set()));
  set.add(transferId);
}

function untrack(connId, transferId) {
  const set = byConn.get(connId);
  if (!set) return;
  set.delete(transferId);
  if (set.size === 0) byConn.delete(connId);
}

const roomOf = (transferId) => {
  let room = rooms.get(transferId);
  if (!room) rooms.set(transferId, (room = new Map()));
  return room;
};

export const getHost = (transferId) => hosts.get(transferId) ?? null;
export const isHostOnline = (transferId) => hosts.has(transferId);
export const getReceiver = (transferId, connId) => rooms.get(transferId)?.get(connId) ?? null;

export function listReceivers(transferId) {
  return [...(rooms.get(transferId)?.entries() ?? [])].map(([connId, r]) => ({ connId, ...r }));
}

export function setHost(transferId, connId) {
  hosts.set(transferId, connId);
  track(connId, transferId);
  for (const r of listReceivers(transferId)) {
    sendToConn(r.connId, "xfer:host-online", { transferId, hostConnId: connId });
  }
}

export function clearHost(transferId, connId) {
  if (hosts.get(transferId) !== connId) return;
  hosts.delete(transferId);
  untrack(connId, transferId);
  for (const r of listReceivers(transferId)) {
    sendToConn(r.connId, "xfer:host-offline", { transferId });
  }
}

export function addReceiver(transferId, connId, info) {
  roomOf(transferId).set(connId, info);
  track(connId, transferId);
  const host = hosts.get(transferId);
  if (host) {
    sendToConn(host, "xfer:peer-joined", { transferId, peer: { connId, ...info } });
  }
}

export function removeReceiver(transferId, connId) {
  const room = rooms.get(transferId);
  if (!room?.delete(connId)) return;
  if (room.size === 0) rooms.delete(transferId);
  untrack(connId, transferId);
  const host = hosts.get(transferId);
  if (host) sendToConn(host, "xfer:peer-left", { transferId, connId });
}

/** Tín hiệu WebRTC chỉ hợp lệ giữa host ↔ 1 receiver của cùng phiên. */
export function isPair(transferId, a, b) {
  const host = hosts.get(transferId);
  const room = rooms.get(transferId);
  if (!host || !room) return false;
  return (a === host && room.has(b)) || (b === host && room.has(a));
}

/** Gửi cho mọi người nhận đang mở phiên (vd có part relay mới). */
export function notifyReceivers(transferId, type, payload) {
  for (const r of listReceivers(transferId)) sendToConn(r.connId, type, payload);
}

export function notifyHost(transferId, type, payload) {
  const host = hosts.get(transferId);
  if (host) sendToConn(host, type, payload);
}

/** Thu hồi / hết hạn → báo mọi bên + dọn phòng. */
export function closeTransfer(transferId) {
  const payload = { transferId };
  notifyReceivers(transferId, "xfer:closed", payload);
  notifyHost(transferId, "xfer:closed", payload);
  for (const r of listReceivers(transferId)) untrack(r.connId, transferId);
  const host = hosts.get(transferId);
  if (host) untrack(host, transferId);
  hosts.delete(transferId);
  rooms.delete(transferId);
}

/** Socket đóng → rời mọi phiên đang host / đang nhận. */
export function dropConn(connId) {
  for (const transferId of [...(byConn.get(connId) ?? [])]) {
    clearHost(transferId, connId);
    removeReceiver(transferId, connId);
  }
  byConn.delete(connId);
}
