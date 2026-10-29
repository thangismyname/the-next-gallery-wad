import "./config/env.js";

import http from "node:http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { ensureBucketExists } from "./config/minio.js";
import { ensureSchema } from "./db/migrate.js";
import routes from "./modules/index.js";
import { setupWebSocket } from "./ws/index.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

const app = express();
const isProduction = process.env.NODE_ENV === "production";

// Sau Caddy: tin 1 proxy → req.ip / req.protocol đúng (log, rate limit auth).
if (isProduction) app.set("trust proxy", 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(morgan(isProduction ? "combined" : "dev"));

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

app.use(express.json());

app.use(routes);

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

async function startServer() {
  await ensureBucketExists();
  await ensureSchema();

  // Create http.Server and attach WebSocket server
  const server = http.createServer(app);
  setupWebSocket(server, { path: "/ws", allowedOrigins });

  server.listen(PORT, () => {
    console.log(
      `🚀 Backend đang chạy tại port ${PORT} (${process.env.NODE_ENV})`,
    );
  });
}

startServer().catch((err) => {
  console.error("❌ Không khởi động được server:", err);
  process.exit(1);
});
