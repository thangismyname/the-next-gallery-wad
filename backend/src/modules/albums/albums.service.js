// Albums — CRUD, ảnh trong album, chuyển album thông minh → thường.
// Quyền: albums.access.js (owner sửa/xoá/chia sẻ; editor thêm ảnh CỦA MÌNH và
// gỡ ảnh mình đã thêm; viewer chỉ xem). Album thông minh không có album_media.
import { dbPool } from "../../config/db.js";
import { MEDIA_COLUMNS } from "../media/media.mapper.js";
import { getMediaItemsByIds } from "../media/media.list.service.js";
import { assertManual, assertRole, getAlbumAccess, httpError } from "./albums.access.js";
import { toAlbumMediaItem, toAlbumSummary } from "./albums.mapper.js";
import { resolveSmartHits, smartSummary } from "./albums.smart.service.js";

// Cột tóm tắt album (cùng 1 chỗ cho danh sách + chi tiết). $1 = user đang xem.
const SUMMARY_SELECT = `
  SELECT a.*,
         CASE WHEN a.user_id = $1 THEN 'owner' ELSE mem.role END AS role,
         mem.accepted_at,
         u.name AS owner_name,
         u.image AS owner_image,
         (SELECT COUNT(*) FROM album_media am
            JOIN media m ON m.id = am.media_id AND m.deleted_at IS NULL
           WHERE am.album_id = a.id)::int AS media_count,
         (SELECT COUNT(*) FROM album_members x
           WHERE x.album_id = a.id AND x.accepted_at IS NOT NULL)::int AS member_count,
         COALESCE(
           (SELECT m.id FROM media m
             WHERE m.id = a.cover_media_id AND m.deleted_at IS NULL),
           (SELECT am.media_id FROM album_media am
              JOIN media m ON m.id = am.media_id AND m.deleted_at IS NULL
             WHERE am.album_id = a.id
             ORDER BY am.added_at DESC LIMIT 1)
         ) AS cover_id
  FROM albums a
  JOIN "user" u ON u.id = a.user_id
  LEFT JOIN album_members mem ON mem.album_id = a.id AND mem.user_id = $1`;

// Album thông minh: số ảnh + bìa tính từ truy vấn (bìa đặt tay vẫn được ưu tiên).
async function summarize(row) {
  if (row.kind !== "smart") return toAlbumSummary(row);
  const { mediaCount, coverId } = await smartSummary(row.user_id, row.smart_rule);
  return toAlbumSummary(row, { mediaCount, coverId: row.cover_id ?? coverId });
}

/** Album của tôi + được chia sẻ với tôi + lời mời đang chờ. */
export async function listAlbums(userId) {
  const result = await dbPool.query(
    `${SUMMARY_SELECT}
     WHERE a.user_id = $1 OR mem.user_id = $1
     ORDER BY a.updated_at DESC`,
    [userId],
  );
  const albums = await Promise.all(result.rows.map(summarize));
  return {
    owned: albums.filter((a) => a.role === "owner"),
    shared: albums.filter((a) => a.role !== "owner" && !a.pending),
    invitations: albums.filter((a) => a.pending),
  };
}

export async function getAlbum(userId, albumId) {
  const access = await getAlbumAccess(userId, albumId, { allowPending: true });
  const result = await dbPool.query(`${SUMMARY_SELECT} WHERE a.id = $2`, [userId, albumId]);
  return { ...(await summarize(result.rows[0])), role: access.role, pending: access.pending };
}

/** Thêm ảnh (chỉ ảnh của chính `actorId`, chưa xoá). Trả số ảnh mới thêm. */
async function insertMedia(client, albumId, actorId, mediaIds) {
  if (mediaIds.length === 0) return 0;
  const result = await client.query(
    `INSERT INTO album_media (album_id, media_id, added_by)
     SELECT $1, m.id, $2
     FROM media m
     WHERE m.id = ANY($3::uuid[]) AND m.user_id = $2 AND m.deleted_at IS NULL
     ON CONFLICT (album_id, media_id) DO NOTHING`,
    [albumId, actorId, mediaIds],
  );
  return result.rowCount;
}

export async function createAlbum(userId, { name, description, mediaIds, smartRule }) {
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    const created = await client.query(
      `INSERT INTO albums (user_id, name, description, kind, smart_rule)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [userId, name, description || null, smartRule ? "smart" : "manual", smartRule ?? null],
    );
    const albumId = String(created.rows[0].id);
    if (!smartRule) await insertMedia(client, albumId, userId, mediaIds);
    await client.query("COMMIT");
    return getAlbum(userId, albumId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function updateAlbum(userId, albumId, patch) {
  const access = await getAlbumAccess(userId, albumId);
  assertRole(access, ["owner"]);
  if (patch.smartRule && access.album.kind !== "smart") {
    throw httpError(400, "Chỉ album thông minh mới có truy vấn", "ALBUM_NOT_SMART");
  }
  if (patch.coverMediaId) {
    // Bìa phải là ảnh đang hiển thị trong album.
    const ok =
      access.album.kind === "smart"
        ? await dbPool.query(
            `SELECT 1 FROM media WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
            [patch.coverMediaId, access.album.user_id],
          )
        : await dbPool.query(
            `SELECT 1 FROM album_media WHERE album_id = $1 AND media_id = $2`,
            [albumId, patch.coverMediaId],
          );
    if (ok.rowCount === 0) throw httpError(400, "Ảnh bìa không nằm trong album");
  }

  const sets = [];
  const params = [albumId];
  const add = (column, value) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };
  if (patch.name !== undefined) add("name", patch.name);
  if (patch.description !== undefined) add("description", patch.description || null);
  if (patch.coverMediaId !== undefined) add("cover_media_id", patch.coverMediaId);
  if (patch.smartRule !== undefined) add("smart_rule", patch.smartRule);
  await dbPool.query(
    `UPDATE albums SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $1`,
    params,
  );
  return getAlbum(userId, albumId);
}

export async function deleteAlbum(userId, albumId) {
  const access = await getAlbumAccess(userId, albumId);
  assertRole(access, ["owner"]);
  // album_media / album_members / share_links: ON DELETE CASCADE. Ảnh giữ nguyên.
  await dbPool.query(`DELETE FROM albums WHERE id = $1`, [albumId]);
}

/** Ảnh trong album (thường: album_media; thông minh: tính từ truy vấn). */
export async function listAlbumMedia(userId, albumId, { limit, offset }) {
  const access = await getAlbumAccess(userId, albumId);
  return listMediaOf(access.album, { limit, offset });
}

/** Dùng chung cho thành viên và link công khai (đã kiểm tra quyền trước). */
export async function listMediaOf(album, { limit, offset }) {
  if (album.kind === "smart") {
    const hits = await resolveSmartHits(album.user_id, album.smart_rule);
    const page = hits.slice(offset, offset + limit);
    const scoreById = new Map(page.map((h) => [h.id, h.score]));
    const items = await getMediaItemsByIds(album.user_id, page.map((h) => h.id));
    return {
      total: hits.length,
      items: items.map((item) => ({
        ...item,
        ownerId: String(album.user_id),
        addedBy: null,
        score: scoreById.get(item.id) ?? null,
      })),
    };
  }

  const [rows, count] = await Promise.all([
    dbPool.query(
      `SELECT ${MEDIA_COLUMNS}, owner_id, added_by
       FROM (
         SELECT media.*, media.user_id AS owner_id, am.added_by,
                am.position AS album_position, am.added_at AS album_added_at
         FROM album_media am
         JOIN media ON media.id = am.media_id
         WHERE am.album_id = $1 AND media.deleted_at IS NULL
       ) media
       -- Ảnh chưa sắp (position NULL, vd mới thêm) lên đầu, mới nhất trước;
       -- sau đó theo thứ tự người dùng đã kéo thả / thứ hạng lúc chuyển từ album thông minh.
       ORDER BY (album_position IS NOT NULL), album_position, album_added_at DESC
       LIMIT $2 OFFSET $3`,
      [album.id, limit, offset],
    ),
    dbPool.query(
      `SELECT COUNT(*)::int AS total
       FROM album_media am
       JOIN media m ON m.id = am.media_id AND m.deleted_at IS NULL
       WHERE am.album_id = $1`,
      [album.id],
    ),
  ]);
  return { total: count.rows[0].total, items: rows.rows.map(toAlbumMediaItem) };
}

export async function addAlbumMedia(userId, albumId, mediaIds) {
  const access = await getAlbumAccess(userId, albumId);
  assertRole(access, ["owner", "editor"]);
  assertManual(access);
  const added = await insertMedia(dbPool, albumId, userId, mediaIds);
  if (added > 0) {
    await dbPool.query(`UPDATE albums SET updated_at = NOW() WHERE id = $1`, [albumId]);
  }
  return { added };
}

/** Owner gỡ được mọi ảnh; editor chỉ gỡ ảnh mình đã thêm. */
export async function removeAlbumMedia(userId, albumId, mediaIds) {
  const access = await getAlbumAccess(userId, albumId);
  assertRole(access, ["owner", "editor"]);
  assertManual(access);
  const result = await dbPool.query(
    `DELETE FROM album_media
     WHERE album_id = $1
       AND media_id = ANY($2::uuid[])
       AND ($3::text IS NULL OR added_by = $3)`,
    [albumId, mediaIds, access.role === "owner" ? null : userId],
  );
  // Gỡ đúng ảnh bìa → bìa về mặc định (ảnh mới nhất).
  await dbPool.query(
    `UPDATE albums SET updated_at = NOW(),
       cover_media_id = CASE WHEN cover_media_id = ANY($2::uuid[]) THEN NULL ELSE cover_media_id END
     WHERE id = $1`,
    [albumId, mediaIds],
  );
  return { removed: result.rowCount };
}

/** Album thông minh → album thường: chốt danh sách ảnh hiện tại. */
export async function convertToManual(userId, albumId) {
  const access = await getAlbumAccess(userId, albumId);
  assertRole(access, ["owner"]);
  if (access.album.kind !== "smart") return getAlbum(userId, albumId);
  const hits = await resolveSmartHits(access.album.user_id, access.album.smart_rule);
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    // Giữ thứ tự xếp hạng của truy vấn bằng `position`.
    await client.query(
      `INSERT INTO album_media (album_id, media_id, added_by, position)
       SELECT $1, x.id, $2, x.pos
       FROM unnest($3::uuid[]) WITH ORDINALITY AS x(id, pos)
       ON CONFLICT (album_id, media_id) DO NOTHING`,
      [albumId, access.album.user_id, hits.map((h) => h.id)],
    );
    await client.query(
      `UPDATE albums SET kind = 'manual', smart_rule = NULL, updated_at = NOW() WHERE id = $1`,
      [albumId],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return getAlbum(userId, albumId);
}

/**
 * Sắp lại thứ tự ảnh (owner, album thường). `mediaIds` = TOÀN BỘ ảnh theo thứ
 * tự mới; ảnh không có trong danh sách giữ nguyên (về đầu vì position NULL).
 */
export async function reorderAlbumMedia(userId, albumId, mediaIds) {
  const access = await getAlbumAccess(userId, albumId);
  assertRole(access, ["owner"]);
  assertManual(access);
  const result = await dbPool.query(
    `UPDATE album_media am
     SET position = x.pos
     FROM unnest($2::uuid[]) WITH ORDINALITY AS x(id, pos)
     WHERE am.album_id = $1 AND am.media_id = x.id`,
    [albumId, mediaIds],
  );
  await dbPool.query(`UPDATE albums SET updated_at = NOW() WHERE id = $1`, [albumId]);
  return { updated: result.rowCount };
}

/**
 * Album (thường) chứa 1 ảnh mà người xem có quyền thấy — Lightbox hiện ở
 * bảng Chi tiết. Album thông minh không tính (tính lại truy vấn cho mỗi ảnh quá đắt).
 */
export async function listAlbumsContaining(userId, mediaId) {
  const result = await dbPool.query(
    `${SUMMARY_SELECT}
     WHERE (a.user_id = $1 OR (mem.user_id = $1 AND mem.accepted_at IS NOT NULL))
       AND EXISTS (
         SELECT 1 FROM album_media x WHERE x.album_id = a.id AND x.media_id = $2
       )
     ORDER BY a.updated_at DESC`,
    [userId, mediaId],
  );
  return result.rows.map((row) => toAlbumSummary(row));
}
