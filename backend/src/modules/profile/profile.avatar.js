// Ảnh đại diện có crop — pure helpers (no DB / MinIO), test: profile.avatar.test.js.
//
// user.image = "<…>/api/profile/avatar/<mediaId>[?c=x,y,w,h]": crop vùng (x, y, w, h)
// chuẩn hoá 0–1 theo ảnh (đã xoay EXIF). Server đọc crop từ URL ĐANG LƯU của user,
// không từ request → bỏ ?c= trên URL cũng không xem được ảnh gốc.

/** Cạnh ảnh đại diện trả về (px, vuông). */
export const AVATAR_SIZE = 400;

const PATH_RE = /\/api\/profile\/avatar\/([0-9a-f-]{36})(?:\?(.*))?$/i;

/** mediaId + crop trong 1 URL ảnh đại diện; null nếu không phải URL avatar thư viện. */
export function parseAvatarUrl(imageUrl) {
  const match = typeof imageUrl === "string" ? PATH_RE.exec(imageUrl) : null;
  if (!match) return null;
  const params = new URLSearchParams(match[2] ?? "");
  return { mediaId: match[1].toLowerCase(), crop: parseCrop(params.get("c")) };
}

/** "x,y,w,h" (0–1) → { x, y, w, h }; sai / thiếu → null (= cả ảnh, như trước khi có crop). */
export function parseCrop(value) {
  if (!value) return null;
  const parts = value.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [x, y, w, h] = parts;
  if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > 1.0001 || y + h > 1.0001) return null;
  return { x, y, w, h };
}

/** Crop chuẩn hoá → vùng pixel nguyên (sharp `extract`) trong ảnh width × height, luôn nằm trong ảnh. */
export function cropBox(crop, width, height) {
  const left = Math.min(Math.max(0, Math.round(crop.x * width)), width - 1);
  const top = Math.min(Math.max(0, Math.round(crop.y * height)), height - 1);
  return {
    left,
    top,
    width: Math.max(1, Math.min(Math.round(crop.w * width), width - left)),
    height: Math.max(1, Math.min(Math.round(crop.h * height), height - top)),
  };
}
