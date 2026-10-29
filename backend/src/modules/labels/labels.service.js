// Nhãn cá nhân: user tự đặt ("Cần chỉnh sửa", "In ảnh"…) để nhớ việc cần làm
// với ảnh. Độc lập với media.is_favorite — trang Yêu thích hiện cả hai.
import { dbPool } from "../../config/db.js";
import { MEDIA_COLUMNS, MEDIA_SORT_CLAUSES, mediaThumbUrl, toMediaItem } from "../media/media.mapper.js";
import { httpError } from "../albums/albums.access.js";
import { LABEL_PRESETS, MAX_LABELS, SEED_PRESETS } from "./labels.constants.js";

// name NULL + preset = nhãn gợi ý chưa đổi tên → FE dịch theo ngôn ngữ.
const toLabel = (row) => ({
  id: String(row.id),
  name: row.name,
  preset: row.preset ?? null,
  color: row.color,
  position: row.position,
  count: row.count ?? 0,
  coverUrl: row.cover_id ? mediaThumbUrl(String(row.cover_id), "med") : null,
});

// Lỗi trùng tên (unique index user_id + lower(name)) → 409.
const rethrowDuplicate = (err) => {
  if (err.code === "23505") throw httpError(409, "Nhãn đã tồn tại", "LABEL_EXISTS");
  throw err;
};

/**
 * Chặn tên trùng 1 nhãn gợi ý (ở bất kỳ ngôn ngữ nào) mà user đang có và chưa
 * đổi tên — tránh 2 nhãn cùng hiện "In ảnh". Trùng tên tự đặt thì unique index lo.
 */
async function assertNotPresetName(userId, name, exceptId = null) {
  const lower = name.toLowerCase();
  const keys = Object.entries(LABEL_PRESETS)
    .filter(([, p]) => p.names.some((n) => n.toLowerCase() === lower))
    .map(([key]) => key);
  if (keys.length === 0) return;
  const clash = await dbPool.query(
    `SELECT 1 FROM user_labels
      WHERE user_id = $1 AND name IS NULL AND preset = ANY($2::text[])
        AND ($3::uuid IS NULL OR id <> $3)`,
    [userId, keys, exceptId],
  );
  if (clash.rowCount > 0) throw httpError(409, "Nhãn đã tồn tại", "LABEL_EXISTS");
}

async function assertOwnLabel(userId, labelId) {
  const result = await dbPool.query(
    `SELECT 1 FROM user_labels WHERE id = $1 AND user_id = $2`,
    [labelId, userId],
  );
  if (result.rowCount === 0) throw httpError(404, "Không tìm thấy nhãn", "LABEL_NOT_FOUND");
}

/** { seeded, totals: { all, favorites }, labels } — count / cover chỉ tính ảnh chưa vào thùng rác. */
export async function listLabels(userId) {
  const [labels, seeded, totals] = await Promise.all([
    dbPool.query(
      `SELECT l.id, l.name, l.preset, l.color, l.position,
              (SELECT COUNT(*)::int FROM media_user_labels ml
                 JOIN media m ON m.id = ml.media_id AND m.deleted_at IS NULL
                WHERE ml.label_id = l.id) AS count,
              (SELECT ml.media_id FROM media_user_labels ml
                 JOIN media m ON m.id = ml.media_id AND m.deleted_at IS NULL
                WHERE ml.label_id = l.id
                ORDER BY ml.created_at DESC LIMIT 1) AS cover_id
         FROM user_labels l
        WHERE l.user_id = $1
        ORDER BY l.position, l.created_at`,
      [userId],
    ),
    dbPool.query(`SELECT 1 FROM user_label_seeds WHERE user_id = $1`, [userId]),
    // Số ảnh cho chip "Tất cả" (tim hoặc nhãn) và "Đã thả tim".
    dbPool.query(
      `SELECT COUNT(*)::int AS all,
              COUNT(*) FILTER (WHERE is_favorite)::int AS favorites
         FROM media
        WHERE user_id = $1 AND deleted_at IS NULL
          AND (is_favorite = true OR EXISTS (
                SELECT 1 FROM media_user_labels ml WHERE ml.media_id = media.id))`,
      [userId],
    ),
  ]).then(([l, s, totals]) => [l, s, totals.rows[0]]);
  return { seeded: seeded.rowCount > 0, totals, labels: labels.rows.map(toLabel) };
}

/** Tạo bộ nhãn gợi ý (lưu theo key) — chỉ 1 lần mỗi user (gọi lại thì bỏ qua). */
export async function seedLabels(userId) {
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    const first = await client.query(
      `INSERT INTO user_label_seeds (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [userId],
    );
    if (first.rowCount > 0) {
      for (const [i, key] of SEED_PRESETS.entries()) {
        await client.query(
          `INSERT INTO user_labels (user_id, preset, color, position)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING`,
          [userId, key, LABEL_PRESETS[key].color, i],
        );
      }
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return listLabels(userId);
}

export async function createLabel(userId, { name, color }) {
  const count = await dbPool.query(
    `SELECT COUNT(*)::int AS n, COALESCE(MAX(position), -1) + 1 AS next
       FROM user_labels WHERE user_id = $1`,
    [userId],
  );
  if (count.rows[0].n >= MAX_LABELS) {
    throw httpError(400, `Tối đa ${MAX_LABELS} nhãn`, "LABEL_LIMIT");
  }
  await assertNotPresetName(userId, name);
  // Tạo thủ công cũng tính là đã có bộ nhãn → không tự thêm gợi ý nữa.
  await dbPool.query(
    `INSERT INTO user_label_seeds (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
    [userId],
  );
  const result = await dbPool
    .query(
      `INSERT INTO user_labels (user_id, name, color, position)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, preset, color, position`,
      [userId, name, color, count.rows[0].next],
    )
    .catch(rethrowDuplicate);
  return toLabel(result.rows[0]);
}

export async function updateLabel(userId, labelId, { name, color }) {
  if (name) await assertNotPresetName(userId, name, labelId);
  const result = await dbPool
    .query(
      `UPDATE user_labels
          SET name = COALESCE($3, name), color = COALESCE($4, color)
        WHERE id = $1 AND user_id = $2
        RETURNING id, name, preset, color, position`,
      [labelId, userId, name ?? null, color ?? null],
    )
    .catch(rethrowDuplicate);
  if (result.rowCount === 0) throw httpError(404, "Không tìm thấy nhãn", "LABEL_NOT_FOUND");
  return toLabel(result.rows[0]);
}

export async function deleteLabel(userId, labelId) {
  const result = await dbPool.query(
    `DELETE FROM user_labels WHERE id = $1 AND user_id = $2`,
    [labelId, userId],
  );
  if (result.rowCount === 0) throw httpError(404, "Không tìm thấy nhãn", "LABEL_NOT_FOUND");
}

/** Gắn nhãn cho ảnh của chính mình (ảnh lạ / đã xoá bị bỏ qua). */
export async function addLabelMedia(userId, labelId, mediaIds) {
  await assertOwnLabel(userId, labelId);
  const result = await dbPool.query(
    `INSERT INTO media_user_labels (label_id, media_id)
     SELECT $1, m.id FROM media m
      WHERE m.user_id = $2 AND m.deleted_at IS NULL AND m.id = ANY($3::uuid[])
     ON CONFLICT DO NOTHING`,
    [labelId, userId, mediaIds],
  );
  return { added: result.rowCount };
}

export async function removeLabelMedia(userId, labelId, mediaIds) {
  await assertOwnLabel(userId, labelId);
  const result = await dbPool.query(
    `DELETE FROM media_user_labels
      WHERE label_id = $1 AND media_id = ANY($2::uuid[])`,
    [labelId, mediaIds],
  );
  return { removed: result.rowCount };
}

/**
 * Nhãn đang gắn trên 1 ảnh (Lightbox). `editable` = ảnh của mình và chưa vào
 * thùng rác — ảnh người khác (album chung) / link công khai thì FE ẩn mục nhãn.
 */
export async function getMediaLabelIds(userId, mediaId) {
  const own = await dbPool.query(
    `SELECT 1 FROM media WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [mediaId, userId],
  );
  if (own.rowCount === 0) return { editable: false, labelIds: [] };
  const result = await dbPool.query(
    `SELECT ml.label_id
       FROM media_user_labels ml
       JOIN user_labels l ON l.id = ml.label_id AND l.user_id = $1
      WHERE ml.media_id = $2
      ORDER BY l.position, l.created_at`,
    [userId, mediaId],
  );
  return { editable: true, labelIds: result.rows.map((r) => String(r.label_id)) };
}

/**
 * Trang Yêu thích: filter = all (có tim HOẶC có nhãn) | favorites (có tim) |
 * <labelId>. Mỗi item kèm `labelIds` để ô ảnh hiện chấm màu.
 */
export async function listSaved(userId, { filter, limit, offset }) {
  const hasLabel = (labelParam) =>
    `EXISTS (SELECT 1 FROM media_user_labels ml WHERE ml.media_id = media.id${
      labelParam ? ` AND ml.label_id = ${labelParam}` : ""
    })`;
  const params = [userId];
  let condition;
  if (filter === "favorites") condition = "is_favorite = true";
  else if (filter === "all") condition = `(is_favorite = true OR ${hasLabel()})`;
  else {
    await assertOwnLabel(userId, filter);
    params.push(filter);
    condition = hasLabel("$2");
  }
  const where = `user_id = $1 AND deleted_at IS NULL AND ${condition}`;

  const [result, count] = await Promise.all([
    dbPool.query(
      `SELECT ${MEDIA_COLUMNS},
              (SELECT array_agg(ml.label_id::text) FROM media_user_labels ml
                WHERE ml.media_id = media.id) AS label_ids
         FROM media
        WHERE ${where}
        ORDER BY ${MEDIA_SORT_CLAUSES.newest}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
    dbPool.query(`SELECT COUNT(*)::int AS total FROM media WHERE ${where}`, params),
  ]);

  return {
    total: count.rows[0].total,
    items: result.rows.map((row) => ({ ...toMediaItem(row), labelIds: row.label_ids ?? [] })),
  };
}
