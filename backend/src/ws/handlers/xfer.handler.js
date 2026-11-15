// ==========================================================
// xfer:* — signaling cho phiên gửi file (modules/transfers)
// ==========================================================
// Người gửi: xfer:host / xfer:unhost (đang mở trang → phục vụ P2P).
// Người nhận: xfer:join / xfer:leave, xfer:report (tiến độ → DB + báo người gửi),
//   xfer:relay-request (P2P hỏng → xin người gửi đẩy file lên relay).
// Hai chiều: xfer:signal (offer / answer / ICE / trao khoá ECDH) — server chỉ
//   chuyển tiếp, không đọc nội dung.
// ==========================================================

import { buildMessage } from "../protocol.js";
import { sendToConn } from "../services/signaling.service.js";
import * as hub from "../services/transfer.hub.js";
import { resolveTransferAccess } from "../../modules/transfers/transfers.access.js";
import {
  ensureLinkRecipient,
  reportRecipient,
} from "../../modules/transfers/transfers.service.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = new Set(["receiving", "done", "failed", "declined"]);
const VIAS = new Set(["p2p", "turn", "relay", "server"]);

function sendError(conn, code, message, extra = {}) {
  if (conn.ws.readyState === 1) {
    conn.ws.send(buildMessage("error", { code, message, ...extra }));
  }
}

function transferIdOf(conn, payload) {
  const id = payload?.transferId;
  if (typeof id !== "string" || !UUID.test(id)) {
    sendError(conn, "INVALID_PAYLOAD", "transferId không hợp lệ");
    return null;
  }
  return id;
}

async function access(conn, transferId, token) {
  try {
    return await resolveTransferAccess({
      transferId,
      token: typeof token === "string" ? token : null,
      userId: conn.userId,
    });
  } catch (err) {
    sendError(conn, err.code || "TRANSFER_ERROR", err.status < 500 ? err.message : "Lỗi phiên gửi", {
      transferId,
    });
    return null;
  }
}

async function host(conn, payload) {
  const transferId = transferIdOf(conn, payload);
  if (!transferId) return;
  const a = await access(conn, transferId, null);
  if (!a) return;
  if (a.role !== "sender") return sendError(conn, "FORBIDDEN", "Chỉ người gửi mới phát được", { transferId });
  hub.setHost(transferId, conn.connId);
  conn.ws.send(
    buildMessage("xfer:hosting", { transferId, peers: hub.listReceivers(transferId) }),
  );
}

function unhost(conn, payload) {
  const transferId = transferIdOf(conn, payload);
  if (transferId) hub.clearHost(transferId, conn.connId);
}

async function join(conn, payload) {
  const transferId = transferIdOf(conn, payload);
  if (!transferId) return;
  const a = await access(conn, transferId, payload.token);
  if (!a) return;
  if (a.role === "sender") {
    return sendError(conn, "OWN_TRANSFER", "Đây là phiên gửi của bạn", { transferId });
  }
  let recipient = a.recipient;
  if (a.role === "link") {
    try {
      recipient = await ensureLinkRecipient(a, {
        userId: conn.userId,
        guestId: conn.guestId,
        name: conn.name,
      });
    } catch (err) {
      return sendError(conn, err.code || "TRANSFER_ERROR", err.message, { transferId });
    }
  }
  hub.addReceiver(transferId, conn.connId, {
    recipientId: recipient.id,
    name: conn.name,
    guest: !conn.userId,
  });
  conn.ws.send(
    buildMessage("xfer:joined", {
      transferId,
      recipientId: recipient.id,
      hostConnId: hub.getHost(transferId),
    }),
  );
}

function leave(conn, payload) {
  const transferId = transferIdOf(conn, payload);
  if (transferId) hub.removeReceiver(transferId, conn.connId);
}

function signal(conn, payload) {
  const transferId = transferIdOf(conn, payload);
  if (!transferId) return;
  const to = payload.to;
  if (typeof to !== "string" || !hub.isPair(transferId, conn.connId, to)) {
    return sendError(conn, "NOT_PAIRED", "Không gửi được tín hiệu", { transferId });
  }
  sendToConn(to, "xfer:signal", { transferId, from: conn.connId, data: payload.data ?? null });
}

async function report(conn, payload) {
  const transferId = transferIdOf(conn, payload);
  if (!transferId) return;
  const me = hub.getReceiver(transferId, conn.connId);
  if (!me) return;
  const recipient = await reportRecipient(me.recipientId, {
    status: STATUSES.has(payload.status) ? payload.status : null,
    via: VIAS.has(payload.via) ? payload.via : null,
    bytes: Number.isFinite(payload.bytes) ? payload.bytes : 0,
  });
  if (recipient) hub.notifyHost(transferId, "xfer:recipient", { transferId, recipient });
}

function relayRequest(conn, payload) {
  const transferId = transferIdOf(conn, payload);
  if (!transferId || !hub.getReceiver(transferId, conn.connId)) return;
  const fileIds = Array.isArray(payload.fileIds)
    ? payload.fileIds.filter((id) => typeof id === "string" && UUID.test(id)).slice(0, 500)
    : [];
  const hostConn = hub.getHost(transferId);
  if (!hostConn) return conn.ws.send(buildMessage("xfer:host-offline", { transferId }));
  sendToConn(hostConn, "xfer:relay-request", { transferId, from: conn.connId, fileIds });
}

export const XFER_HANDLERS = {
  "xfer:host": host,
  "xfer:unhost": unhost,
  "xfer:join": join,
  "xfer:leave": leave,
  "xfer:signal": signal,
  "xfer:report": report,
  "xfer:relay-request": relayRequest,
};

/** Khách (không đăng nhập) chỉ được dùng các message nhận file. */
export const GUEST_ALLOWED = new Set(["xfer:join", "xfer:leave", "xfer:signal", "xfer:report", "xfer:relay-request"]);
