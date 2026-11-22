import { dbPool } from "../../config/db.js";
import { httpError } from "../../middleware/errorHandler.js";
import { toImportSession } from "./imports.mapper.js";

const SESSION_COLUMNS = `s.id, s.source, s.client, s.status, s.plan, s.skipped_existing, s.failures,
  s.started_at, s.finished_at,
  (SELECT COUNT(*) FILTER (WHERE NOT m.duplicate) FROM import_session_media m WHERE m.session_id = s.id) AS imported,
  (SELECT COUNT(*) FILTER (WHERE m.duplicate) FROM import_session_media m WHERE m.session_id = s.id) AS duplicates`;

export async function createImport(userId, { source, client, plan }) {
  const { rows } = await dbPool.query(
    `INSERT INTO import_sessions (user_id, source, client, plan) VALUES ($1, $2, $3, $4) RETURNING id`,
    [userId, source, client, plan],
  );
  return getImport(userId, rows[0].id);
}

/** 20 phiên gần nhất (không kèm danh sách lỗi — xem trong báo cáo). */
export async function listImports(userId) {
  const { rows } = await dbPool.query(
    `SELECT ${SESSION_COLUMNS} FROM import_sessions s WHERE s.user_id = $1 ORDER BY s.started_at DESC LIMIT 20`,
    [userId],
  );
  return rows.map((row) => {
    const { failures, ...rest } = toImportSession(row);
    return rest;
  });
}

export async function getImport(userId, id) {
  const { rows } = await dbPool.query(`SELECT ${SESSION_COLUMNS} FROM import_sessions s WHERE s.id = $1 AND s.user_id = $2`, [
    id,
    userId,
  ]);
  if (!rows[0]) throw httpError(404, "IMPORT_NOT_FOUND", "Không tìm thấy phiên import");
  return toImportSession(rows[0]);
}

/** Client báo phần server không thấy (đã có sẵn, lỗi) + trạng thái; status ≠ running → đóng phiên. */
export async function updateImport(userId, id, { status, skippedExisting, failures }) {
  const { rowCount } = await dbPool.query(
    `UPDATE import_sessions SET
       status = COALESCE($3, status),
       skipped_existing = COALESCE($4, skipped_existing),
       failures = COALESCE($5::jsonb, failures),
       finished_at = CASE WHEN COALESCE($3, status) <> 'running' THEN COALESCE(finished_at, NOW()) ELSE NULL END,
       updated_at = NOW()
     WHERE id = $1 AND user_id = $2`,
    [id, userId, status ?? null, skippedExisting ?? null, failures ? JSON.stringify(failures) : null],
  );
  if (!rowCount) throw httpError(404, "IMPORT_NOT_FOUND", "Không tìm thấy phiên import");
  return getImport(userId, id);
}

/**
 * Upload thuộc một phiên (`meta.importId`) → ghi lại để đếm. Chỉ phiên của chính user và đang chạy;
 * id lạ bị bỏ qua (không làm hỏng upload).
 */
export async function recordImportMedia(userId, importId, mediaId, duplicate) {
  if (!importId) return;
  await dbPool.query(
    `INSERT INTO import_session_media (session_id, media_id, duplicate)
     SELECT s.id, $3, $4 FROM import_sessions s WHERE s.id = $1 AND s.user_id = $2 AND s.status = 'running'
     ON CONFLICT (session_id, media_id) DO NOTHING`,
    [importId, userId, mediaId, duplicate],
  );
}

/**
 * Trước khi upload: `{ name, size }` nào user đã có (mọi trạng thái, cả Thùng rác) để client bỏ qua.
 * Cùng tên + cùng dung lượng KB (như lúc upload lưu) = trùng — rẻ, không cần bytes; SHA-256 trong
 * `uploadMedia` vẫn là chốt chặn thật.
 * @returns {Promise<boolean[]>} theo thứ tự `items`
 */
export async function findExistingUploads(userId, items) {
  const { rows } = await dbPool.query(
    `SELECT DISTINCT x.i::int AS i
     FROM unnest($2::text[], $3::int[]) WITH ORDINALITY AS x(name, kb, i)
     JOIN media m ON m.user_id = $1 AND m.original_filename = x.name AND m.file_size_kb = x.kb`,
    [userId, items.map((it) => it.name), items.map((it) => Math.round(it.size / 1024))],
  );
  const exists = items.map(() => false);
  for (const { i } of rows) exists[i - 1] = true;
  return exists;
}
