import "./config/env.js";

import http from "node:http";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger.js";
import { ensureBucketExists } from "./config/minio.js";
import { ensureSchema } from "./db/migrate.js";
import { initRedis } from "./config/redis.js";
import routes from "./modules/index.js";
import { setupWebSocket } from "./ws/index.js";
import { startTransferJobs } from "./modules/transfers/transfers.jobs.js";
import { startMomentsJobs } from "./modules/moments/moments.jobs.js";
import { startAuthJobs } from "./modules/auth/auth.jobs.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

const app = express();
const isProduction = process.env.NODE_ENV === "production";

// Sau Caddy: tin 1 proxy → req.ip / req.protocol đúng (log, rate limit auth).
if (isProduction) app.set("trust proxy", 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

// Request tracing: gắn X-Request-ID cho mỗi request (mobile app / FE có thể gửi).
app.use((req, res, next) => {
  const id = req.headers["x-request-id"] || crypto.randomUUID();
  req.id = id;
  res.setHeader("X-Request-ID", id);
  next();
});

// Structured logging (pino-http).
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => req.id,
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
  }),
);

// CORS có cookie: production BẮT BUỘC liệt kê origin — `origin: true` (phản
// chiếu mọi origin) sẽ cho trang bất kỳ đọc API bằng phiên của người dùng.
const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
if (isProduction && allowedOrigins.length === 0) {
  throw new Error("CORS_ORIGINS is required in production (comma-separated web origins)");
}
app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
  }),
);

// Tạo phiên gửi file kèm thumbnail đã mã hoá (≤ 500 file) → body lớn hơn mặc định 100 KB.
const jsonDefault = express.json();
const jsonTransfer = express.json({ limit: "8mb" });
app.use((req, res, next) =>
  req.method === "POST" && req.path === "/api/transfers"
    ? jsonTransfer(req, res, next)
    : jsonDefault(req, res, next),
);

// API v1: alias cho /api (mobile app + web dùng chung). Rewrite /api/v1/* → /api/*.
app.use((req, _res, next) => {
  if (req.url.startsWith("/api/v1/")) {
    req.url = req.url.replace(/^\/api\/v1\//, "/api/");
  } else if (req.url === "/api/v1") {
    req.url = "/api";
  }
  next();
});
app.use(routes);

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

async function startServer() {
  await initRedis();
  await ensureBucketExists();
  await ensureSchema();
  startTransferJobs();
  startMomentsJobs();
  startAuthJobs();

  // Create http.Server and attach WebSocket server
  const server = http.createServer(app);
  setupWebSocket(server, { path: "/ws", allowedOrigins });

  server.listen(PORT, () => {
    logger.info(`Backend đang chạy tại port ${PORT} (${process.env.NODE_ENV})`);
  });

  // Graceful shutdown (Prio: resilience).
  const shutdown = (signal) => {
    logger.info(`[server] ${signal} received, shutting down gracefully...`);
    server.close(() => {
      logger.info("[server] HTTP server closed");
      process.exit(0);
    });
    // Force exit sau 10s nếu connection không đóng.
    setTimeout(() => {
      logger.error("[server] Forced exit after timeout");
      process.exit(1);
    }, 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

startServer().catch((err) => {
  logger.error({ err }, "Không khởi động được server");
  process.exit(1);
});
