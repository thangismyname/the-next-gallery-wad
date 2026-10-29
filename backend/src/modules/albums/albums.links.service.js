// Link công khai của album (share_links): ai có link đều xem được, không cần
// tài khoản. Token ngẫu nhiên 32 ký tự; có hạn dùng + giới hạn lượt xem.
import crypto from "crypto";
import { dbPool } from "../../config/db.js";
import { assertRole, getAlbumAccess, httpError } from "./albums.access.js";
import { toShareLink } from "./albums.mapper.js";
import { mediaUrls } from "../media/media.mapper.js";
import { forgetLink } from "../media/media.access.js";
import { listMediaOf } from "./albums.service.js";

export async function listLinks(userId, albumId) {
  const access = await getAlbumAccess(userId, albumId);
  assertRole(access, ["owner"]);
  const result = await dbPool.query(
    `SELECT * FROM share_links WHERE album_id = $1 ORDER BY created_at DESC`,
    [albumId],
  );
  return result.rows.map(toShareLink);
}

export async function createLink(userId, albumId, { permission, expiresInDays, maxViews }) {
  const access = await getAlbumAccess(userId, albumId);
  assertRole(access, ["owner"]);
  const token = crypto.randomBytes(24).toString("base64url");
  const result = await dbPool.query(
    `INSERT INTO share_links (token, created_by_user_id, album_id, permission, expires_at, max_views)
     VALUES ($1, $2, $3, $4,
             CASE WHEN $5::int IS NULL THEN NULL ELSE NOW() + make_interval(days => $5::int) END,
             $6)
     RETURNING *`,
    [token, userId, albumId, permission, expiresInDays, maxViews],
  );
  return toShareLink(result.rows[0]);
}

export async function deleteLink(userId, albumId, linkId) {
  const access = await getAlbumAccess(userId, albumId);
  assertRole(access, ["owner"]);
  await dbPool.query(`DELETE FROM share_links WHERE id = $1 AND album_id = $2`, [linkId, albumId]);
  forgetLink(linkId);
}

/**
 * Xem album qua link (không cần đăng nhập). Trang đầu (offset 0) tính 1 lượt
 * xem; hết hạn / hết lượt → 410.
 */
export async function getPublicAlbum(token, { limit, offset }) {
  const result = await dbPool.query(
    `SELECT l.*, a.id AS a_id, a.user_id AS a_user_id, a.name, a.description,
            a.kind, a.smart_rule, u.name AS owner_name, u.image AS owner_image
     FROM share_links l
     JOIN albums a ON a.id = l.album_id
     JOIN "user" u ON u.id = a.user_id
     WHERE l.token = $1`,
    [token],
  );
  const link = result.rows[0];
  if (!link) throw httpError(404, "Link không tồn tại hoặc đã bị thu hồi", "LINK_NOT_FOUND");
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    throw httpError(410, "Link đã hết hạn", "LINK_EXPIRED");
  }
  if (offset === 0) {
    const counted = await dbPool.query(
      `UPDATE share_links SET view_count = view_count + 1
       WHERE id = $1 AND (max_views IS NULL OR view_count < max_views)
       RETURNING view_count`,
      [link.id],
    );
    if (counted.rowCount === 0) throw httpError(410, "Link đã hết lượt xem", "LINK_EXHAUSTED");
  } else if (link.max_views !== null && link.view_count > link.max_views) {
    throw httpError(410, "Link đã hết lượt xem", "LINK_EXHAUSTED");
  }

  const album = { id: link.a_id, user_id: link.a_user_id, kind: link.kind, smart_rule: link.smart_rule };
  const { total, items } = await listMediaOf(album, { limit, offset });
  return {
    album: {
      name: link.name,
      description: link.description ?? null,
      owner: { name: link.owner_name ?? null, image: link.owner_image ?? null },
      permission: link.permission,
      expiresAt: link.expires_at ?? null,
    },
    total,
    // Người xem ẩn danh không cần biết chủ / người thêm từng ảnh. URL ký lại
    // gắn với link → thu hồi link là ảnh bị chặn ngay.
    items: items.map(({ ownerId: _o, addedBy: _a, ...item }) => ({
      ...item,
      ...mediaUrls(item.id, { heif: Boolean(item.fullUrl), scope: String(link.id) }),
    })),
  };
}
