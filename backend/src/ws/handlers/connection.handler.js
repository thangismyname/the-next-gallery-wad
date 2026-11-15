// ==========================================================
// Connection Handler — Auth + message router
// ==========================================================
// - `auth` đầu tiên: có cookie Better Auth → user; không có → khách (chỉ dùng
//   được các message nhận file `xfer:*`, xem xfer.handler.js::GUEST_ALLOWED).
// - Mỗi socket 1 connId (signaling.service) — tín hiệu WebRTC gửi đúng tab.
// - Đóng socket → rời mọi phiên gửi + presence offline (socket cuối của user).
// ==========================================================

import { auth } from "../../lib/auth.js";
import { buildMessage, parseMessage } from "../protocol.js";
import {
  getPeer,
  registerConn,
  registerPeer,
  removeConn,
  removePeer,
} from "../services/signaling.service.js";
import { dropConn } from "../services/transfer.hub.js";
import { GUEST_ALLOWED, XFER_HANDLERS } from "./xfer.handler.js";
import {
  broadcastOffline,
  broadcastOnline,
  sendSnapshot,
} from "../services/presence.service.js";
import { logger } from "../../lib/logger.js";

const GUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

const cleanName = (value) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 40) || null : null;

export function handleConnection(ws, req) {
  let conn = null;

  // Xử lý tuần tự — message gửi ngay sau `auth` không chạy trước khi getSession xong.
  let queue = Promise.resolve();
  ws.on("message", (raw) => {
    queue = queue
      .then(async () => {
        const msg = parseMessage(raw);
        if (!msg) return sendError(ws, "BAD_MESSAGE", "Tin nhắn không hợp lệ");
        if (msg.type === "auth") return handleAuth(msg.payload);
        if (!conn) return sendError(ws, "UNAUTHORIZED", "Chưa xác thực");
        if (!conn.userId && !GUEST_ALLOWED.has(msg.type)) {
          return sendError(ws, "UNAUTHORIZED", "Cần đăng nhập");
        }
        const handler = XFER_HANDLERS[msg.type];
        if (!handler) return sendError(ws, "UNKNOWN_TYPE", `Không hỗ trợ message: ${msg.type}`);
        await handler(conn, msg.payload);
      })
      .catch((err) => {
        logger.error({ err }, "[ws] handler error");
        sendError(ws, "HANDLER_ERROR", "Lỗi server khi xử lý tin nhắn");
      });
  });

  async function handleAuth(payload = {}) {
    if (conn) return; // đã xác thực (client gửi lại khi reconnect cùng socket)
    try {
      const session = await auth.api.getSession({ headers: req.headers });
      if (session?.user) {
        const userId = session.user.id;
        const isFirstSocket = !getPeer(userId);
        const peer = registerPeer(userId, session.user.name || "Anonymous", session.user.image || null, ws);
        conn = registerConn(ws, { userId, name: peer.username });
        ws.send(
          buildMessage("auth:success", {
            userId,
            username: peer.username,
            connId: conn.connId,
            guest: false,
          }),
        );
        if (isFirstSocket) {
          void broadcastOnline(userId).catch((err) => logger.error({ err }, "[ws] presence online error"));
        }
        void sendSnapshot(userId).catch((err) => logger.error({ err }, "[ws] presence snapshot error"));
        return;
      }

      // Khách: id ổn định do trình duyệt tự sinh (localStorage) để nhận tiếp sau khi tải lại trang.
      const guestId = typeof payload.guestId === "string" && GUEST_ID.test(payload.guestId) ? payload.guestId : null;
      if (!guestId) return sendError(ws, "AUTH_FAILED", "Chưa đăng nhập");
      conn = registerConn(ws, { guestId, name: cleanName(payload.name) });
      ws.send(buildMessage("auth:success", { connId: conn.connId, guest: true }));
    } catch (err) {
      logger.error({ err }, "[ws] auth error");
      sendError(ws, "AUTH_ERROR", "Lỗi khi xác thực");
    }
  }

  ws.on("close", () => {
    if (!conn) return;
    dropConn(conn.connId);
    removeConn(conn.connId);
    if (conn.userId) {
      removePeer(conn.userId, ws);
      if (!getPeer(conn.userId)) {
        void broadcastOffline(conn.userId).catch((err) => logger.error({ err }, "[ws] presence offline error"));
      }
    }
  });

  ws.on("error", (err) => {
    logger.error({ err }, "[ws] connection error");
  });
}

function sendError(ws, code, message) {
  if (ws.readyState === 1) ws.send(buildMessage("error", { code, message }));
}
