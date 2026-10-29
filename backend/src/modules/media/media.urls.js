// URL ảnh / video có chữ ký (HMAC + hạn dùng) — stream endpoint không còn mở
// công khai chỉ dựa vào UUID.
//
//   /api/gallery/media/:id/thumbnail?size=med&v=2&exp=…&sig=…[&l=<linkId>]
//   /api/gallery/media/:id/file?exp=…&sig=…[&l=<linkId>]
//
// - exp làm tròn theo khung TTL (mặc định 24h, hiệu lực 24–48h): URL đứng yên
//   trong 1 khung → cache trình duyệt (immutable) vẫn trúng.
// - `l` = id link công khai (share_links) đã cấp URL: stream kiểm tra link còn
//   hiệu lực → thu hồi link là ảnh bị chặn ngay, không đợi hết hạn.
import crypto from "crypto";

const SECRET = process.env.MEDIA_URL_SECRET || process.env.BETTER_AUTH_SECRET;
const TTL_S = Math.max(1, Number(process.env.MEDIA_URL_TTL_HOURS) || 24) * 3600;

function signature(mediaId, kind, exp, scope) {
  return crypto
    .createHmac("sha256", SECRET)
    .update(`${mediaId}:${kind}:${exp}:${scope}`)
    .digest("base64url")
    .slice(0, 32);
}

/** kind = "file" | small | med | display | full. scope = id link công khai ("" = người dùng đã đăng nhập). */
export function signParams(mediaId, kind, scope = "") {
  const now = Math.floor(Date.now() / 1000);
  const exp = (Math.floor(now / TTL_S) + 2) * TTL_S;
  const params = new URLSearchParams({ exp: String(exp), sig: signature(mediaId, kind, exp, scope) });
  if (scope) params.set("l", scope);
  return params.toString();
}

/**
 * @returns {{ ok: true, exp: number, scope: string } | { ok: false }}
 */
export function verifyParams(mediaId, kind, query) {
  const exp = Number(query.exp);
  const sig = typeof query.sig === "string" ? query.sig : "";
  const scope = typeof query.l === "string" ? query.l : "";
  if (!Number.isFinite(exp) || exp < Date.now() / 1000 || sig.length !== 32) {
    return { ok: false };
  }
  const given = Buffer.from(sig);
  const expected = Buffer.from(signature(mediaId, kind, exp, scope));
  // So độ dài theo BYTE trước — timingSafeEqual ném lỗi nếu khác (ký tự nhiều byte).
  const ok = given.length === expected.length && crypto.timingSafeEqual(given, expected);
  return ok ? { ok, exp, scope } : { ok: false };
}
