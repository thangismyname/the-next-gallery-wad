// Ai được tải ảnh / video từ stream endpoint (thumbnail, file):
//   1. URL có chữ ký còn hạn (media.urls.js) — mọi URL backend trả về đều đã ký.
//      URL cấp qua link công khai (`l`) chỉ dùng được khi link còn hiệu lực.
//   2. Không có chữ ký → phải đăng nhập và là chủ ảnh (vd fetch có cookie).
import { dbPool } from "../../config/db.js";
import { auth } from "../../lib/auth.js";
import { verifyParams } from "./media.urls.js";

const LINK_CACHE_MS = 30_000;
const linkCache = new Map();

// Link công khai còn dùng được: còn tồn tại, chưa hết hạn, chưa vượt lượt xem
// (lượt xem tính lúc mở album — ảnh của lần xem cuối vẫn tải được).
async function isLinkActive(linkId) {
  const cached = linkCache.get(linkId);
  if (cached && Date.now() - cached.at < LINK_CACHE_MS) return cached.active;
  const result = await dbPool.query(
    `SELECT 1 FROM share_links
     WHERE id = $1
       AND (expires_at IS NULL OR expires_at > NOW())
       AND (max_views IS NULL OR view_count <= max_views)`,
    [linkId],
  );
  const active = result.rowCount > 0;
  linkCache.set(linkId, { at: Date.now(), active });
  return active;
}

/** Thu hồi link → bỏ cache để ảnh bị chặn ngay. */
export function forgetLink(linkId) {
  linkCache.delete(linkId);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @param {string} kind "file" | small | med | display | full
 * @returns {Promise<{ cacheControl: string } | null>} null = không có quyền.
 */
export async function authorizeMediaRequest(req, mediaId, kind) {
  if (!UUID.test(mediaId)) return null;
  const signed = verifyParams(mediaId, kind, req.query);
  if (signed.ok) {
    if (signed.scope) {
      if (!UUID.test(signed.scope) || !(await isLinkActive(signed.scope))) return null;
      // Ảnh qua link công khai: cache ngắn, riêng tư → thu hồi link có hiệu lực sớm.
      return { cacheControl: "private, max-age=300" };
    }
    const maxAge = Math.max(0, signed.exp - Math.floor(Date.now() / 1000));
    return { cacheControl: `public, max-age=${maxAge}, immutable` };
  }

  const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);
  if (!session) return null;
  const owner = await dbPool.query(`SELECT 1 FROM media WHERE id = $1 AND user_id = $2`, [
    mediaId,
    session.user.id,
  ]);
  return owner.rowCount > 0 ? { cacheControl: "private, max-age=3600" } : null;
}
