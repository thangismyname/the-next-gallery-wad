// ==========================================================
// WebSocket Server — setupWebSocket(server)
// ==========================================================
//
// Attaches a WebSocketServer to an existing http.Server.
// Call this from server.js after creating the http server:
//
//   import { setupWebSocket } from "./ws/index.js";
//   const server = http.createServer(app);
//   setupWebSocket(server, { path: "/ws", allowedOrigins });
//   server.listen(PORT, ...);
// ==========================================================

import { WebSocketServer } from "ws";
import { handleConnection } from "./handlers/connection.handler.js";
import { logger } from "../lib/logger.js";

let wss = null;

export function setupWebSocket(server, options = {}) {
  const path = options.path || "/ws";
  const allowedOrigins = options.allowedOrigins ?? [];

  wss = new WebSocketServer({
    server,
    path,
    maxPayload: 1024 * 1024, // 1MB max control message
    clientTracking: true,
    // Chặn trang lạ mở WS bằng cookie của người dùng (cross-site WebSocket
    // hijacking). Không có Origin = client không phải trình duyệt → cho qua;
    // chưa cấu hình CORS_ORIGINS (dev) → cho qua.
    verifyClient: ({ origin }) =>
      !origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin),
  });

  wss.on("connection", (ws, req) => {
    logger.info(`[ws] New connection from ${req.socket.remoteAddress} on ${path}`);
    handleConnection(ws, req);
  });

  wss.on("error", (err) => {
    logger.error({ err }, "[ws] WebSocketServer error");
  });

  logger.info(`[ws] WebSocket server listening at ${path}`);

  return wss;
}

