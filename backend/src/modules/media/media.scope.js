// Phạm vi tìm kiếm Spotlight: "favorites" | "label:<id>" | "album:<id>" →
// tập id ảnh CỦA CHÍNH user (chưa vào thùng rác). Album chung chỉ tính ảnh của
// mình (search chỉ có vector ảnh của mình) — không cần kiểm tra quyền album.
import { dbPool } from "../../config/db.js";

export const SCOPE_PATTERN =
  /^(favorites|(label|album):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** @returns {Promise<string[]>} id ảnh trong phạm vi, mới nhất trước. */
export async function scopeMediaIds(userId, scope) {
  const [kind, id] = scope.split(":");
  const source = {
    favorites: `SELECT id FROM media WHERE is_favorite = true`,
    label: `SELECT ml.media_id AS id FROM media_user_labels ml
              JOIN user_labels l ON l.id = ml.label_id AND l.user_id = $1
             WHERE ml.label_id = $2`,
    album: `SELECT media_id AS id FROM album_media WHERE album_id = $2`,
  }[kind];
  const result = await dbPool.query(
    `SELECT s.id FROM (${source}) s
       JOIN media m ON m.id = s.id
      WHERE m.user_id = $1 AND m.deleted_at IS NULL
      ORDER BY COALESCE(m.taken_at, m.created_at) DESC`,
    kind === "favorites" ? [userId] : [userId, id],
  );
  return result.rows.map((row) => String(row.id));
}
