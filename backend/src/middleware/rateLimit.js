// Giới hạn tần suất cho các route tốn tài nguyên (gọi ai-service, ghi MinIO,
// nén zip). Đếm theo user khi đã đăng nhập (đặt SAU requireAuth), không thì
// theo IP (`trust proxy` bật ở production nên IP là IP thật sau Caddy).
// Store: Redis nếu REDIS_URL set + reachable, fallback in-memory.
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { getRedis } from "../config/redis.js";

function makeStore(name) {
  const redis = getRedis();
  if (!redis) return undefined; // in-memory default
  return new RedisStore({
    sendCommand: (...args) => redis.call(...args),
    prefix: `rl:${name}:`,
  });
}

function limiter(name, { windowMs = 60_000, limit }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    store: makeStore(name),
    keyGenerator: (req) => (req.user?.id ? `u:${req.user.id}` : `ip:${ipKeyGenerator(req.ip)}`),
    handler: (_req, res) =>
      res.status(429).json({
        success: false,
        error: { code: "RATE_LIMITED", message: "Thao tác quá nhanh, thử lại sau ít phút" },
      }),
    // Tách bộ đếm của từng nhóm route.
    identifier: name,
  });
}

/** Spotlight: ~1 lần gõ / giây (debounce 400 ms gọi tối đa 4 nguồn song song). */
export const searchLimit = limiter("search", { limit: 240 });
/** Upload: mỗi request ≤ 20 file. */
export const uploadLimit = limiter("upload", { limit: 30 });
/** Backfill AI (CLIP / YOLO / DINO / tag / thumbnail) theo lô. */
export const backfillLimit = limiter("backfill", { limit: 120 });
/** Tải zip nhiều ảnh. */
export const downloadLimit = limiter("download", { limit: 20 });
/** Link album công khai (không đăng nhập) — theo IP. */
export const publicLimit = limiter("public", { limit: 300 });
/** Nhập mã 6 số nhận file — chống dò mã (32^6 ≈ 1 tỉ, mã sống 10 phút). */
export const transferCodeLimit = limiter("transfer-code", { limit: 20 });
/** Tạo phiên gửi / đổi mã / thu hồi. */
export const transferWriteLimit = limiter("transfer-write", { limit: 60 });
/** Part relay 4 MiB: 5 GB ≈ 1280 part — đủ cho ~100 MB/s. */
export const relayLimit = limiter("transfer-relay", { limit: 3000 });
/** Moments: đọc feed / lời mời (infinite scroll + badge). */
export const momentsReadLimit = limiter("moments-read", { limit: 240 });
/** Moments: tạo / sửa / điền slot / xoá / rời / reaction. */
export const momentsWriteLimit = limiter("moments-write", { limit: 30 });
/** Meme: mỗi lần tạo gọi memegen.link rồi tải ảnh về MinIO → chặn spam. */
export const memeWriteLimit = limiter("meme-write", { limit: 10 });
