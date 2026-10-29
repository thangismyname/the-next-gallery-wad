// Giới hạn tần suất cho các route tốn tài nguyên (gọi ai-service, ghi MinIO,
// nén zip). Đếm theo user khi đã đăng nhập (đặt SAU requireAuth), không thì
// theo IP (`trust proxy` bật ở production nên IP là IP thật sau Caddy).
// Bộ đếm trong RAM — 1 instance backend là đủ; chạy nhiều instance thì cần
// store chung (Redis). Better Auth tự giới hạn các route đăng nhập.
import { ipKeyGenerator, rateLimit } from "express-rate-limit";

function limiter(name, { windowMs = 60_000, limit }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
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
