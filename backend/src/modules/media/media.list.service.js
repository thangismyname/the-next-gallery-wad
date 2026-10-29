import { dbPool } from "../../config/db.js";
import {
  MEDIA_COLUMNS,
  MEDIA_SORT_CLAUSES,
  mediaThumbUrl,
  toMediaItem,
} from "./media.mapper.js";

export async function listMedia(userId, { limit, offset, sort = "newest", type }) {
  const orderBy = MEDIA_SORT_CLAUSES[sort] ?? MEDIA_SORT_CLAUSES.newest;
  const conditions = ["user_id = $1", "deleted_at IS NULL"];
  const params = [userId];
  if (type === "photo" || type === "video") {
    params.push(type);
    conditions.push(`media_type = $${params.length}`);
  }
  const where = conditions.join("\n      AND ");
  const [result, count] = await Promise.all([
    dbPool.query(
      `SELECT ${MEDIA_COLUMNS}
      FROM media
      WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
    // Tổng số (không chỉ số đã tải) — header Thư viện hiện "400 ảnh".
    dbPool.query(`SELECT COUNT(*)::int AS total FROM media WHERE ${where}`, params),
  ]);

  const items = result.rows.map(toMediaItem);

  return {
    items,
    total: count.rows[0].total,
    hasMore: offset + items.length < count.rows[0].total,
    limit,
    offset,
  };
}

export async function listFavorites(userId, { limit, offset }) {
  const result = await dbPool.query(
    `SELECT ${MEDIA_COLUMNS}
    FROM media
    WHERE user_id = $1
      AND deleted_at IS NULL
      AND is_favorite = true
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );

  return {
    items: result.rows.map(toMediaItem),
    hasMore: result.rows.length === limit,
    limit,
    offset,
  };
}

export async function setFavorite(userId, ids, favorite) {
  if (!Array.isArray(ids) || ids.length === 0) return { count: 0 };

  const result = await dbPool.query(
    `UPDATE media
     SET is_favorite = $3, updated_at = NOW()
     WHERE user_id = $1
       AND id = ANY($2::uuid[])
       AND deleted_at IS NULL
     RETURNING id`,
    [userId, ids, favorite],
  );

  return { count: result.rowCount };
}

// Danh sách album kèm ảnh đại diện — dùng cho category cards trên Home.
// Cover ưu tiên albums.cover_media_id, nếu NULL thì lấy ảnh mới nhất trong album.
export async function listAlbumCovers(userId, { limit }) {
  const albumsResult = await dbPool.query(
    `SELECT id, name, cover_media_id
     FROM albums
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit],
  );

  const albums = albumsResult.rows;
  if (albums.length === 0) return { items: [] };

  // Ảnh mới nhất trong mỗi album chưa set cover_media_id
  const missingCoverIds = albums
    .filter((a) => a.cover_media_id === null)
    .map((a) => a.id);

  const latestByAlbum = new Map();
  if (missingCoverIds.length > 0) {
    const latestResult = await dbPool.query(
      `SELECT DISTINCT ON (am.album_id)
         am.album_id,
         m.id,
         m.thumbnail_small_object,
         m.thumbnail_object
       FROM album_media am
       JOIN media m ON m.id = am.media_id AND m.deleted_at IS NULL
       WHERE am.album_id = ANY($1::uuid[])
       ORDER BY am.album_id, am.added_at DESC`,
      [missingCoverIds],
    );
    for (const row of latestResult.rows) {
      latestByAlbum.set(String(row.album_id), row);
    }
  }

  const explicitCoverIds = [
    ...new Set(
      albums.map((a) => a.cover_media_id).filter(Boolean),
    ),
  ];
  const explicitById = new Map();
  if (explicitCoverIds.length > 0) {
    const covResult = await dbPool.query(
      `SELECT id, thumbnail_small_object, thumbnail_object
       FROM media
       WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
      [explicitCoverIds],
    );
    for (const row of covResult.rows) {
      explicitById.set(String(row.id), row);
    }
  }

  const items = albums.map((a) => {
    const explicit = a.cover_media_id
      ? explicitById.get(String(a.cover_media_id))
      : null;
    const cover = explicit || latestByAlbum.get(String(a.id)) || null;

    let coverUrl = null;
    if (cover) {
      coverUrl = mediaThumbUrl(String(cover.id), "small");
    }

    return { id: String(a.id), name: a.name, coverUrl };
  });

  return { items };
}

// Lấy media theo danh sách id, giữ đúng thứ tự `ids` (kết quả semantic search
// đã xếp hạng sẵn theo độ tương đồng).
export async function getMediaItemsByIds(userId, ids) {
  if (ids.length === 0) return [];
  const result = await dbPool.query(
    `SELECT ${MEDIA_COLUMNS}
     FROM media
     WHERE user_id = $1
       AND deleted_at IS NULL
       AND id = ANY($2::uuid[])`,
    [userId, ids],
  );
  const byId = new Map(result.rows.map((row) => [String(row.id), row]));
  return ids
    .map((id) => byId.get(String(id)))
    .filter(Boolean)
    .map(toMediaItem);
}
