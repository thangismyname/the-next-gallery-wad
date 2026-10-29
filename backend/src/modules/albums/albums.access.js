// Quyền truy cập album — mọi route album đi qua đây trước khi đọc/ghi.
import { dbPool } from "../../config/db.js";

export const httpError = (status, message, code) =>
  Object.assign(new Error(message), { status, ...(code ? { code } : {}) });

/**
 * Vai trò của `userId` trong album: owner | editor | viewer. Không có quyền →
 * 404 (không lộ là album có tồn tại). Lời mời chưa nhận chỉ qua khi `allowPending`.
 * @returns {Promise<{ album: object, role: string, pending: boolean }>}
 */
export async function getAlbumAccess(userId, albumId, { allowPending = false } = {}) {
  const result = await dbPool.query(
    `SELECT a.*, mem.role AS member_role, mem.accepted_at
     FROM albums a
     LEFT JOIN album_members mem ON mem.album_id = a.id AND mem.user_id = $1
     WHERE a.id = $2`,
    [userId, albumId],
  );
  const row = result.rows[0];
  if (!row) throw httpError(404, "Không tìm thấy album", "ALBUM_NOT_FOUND");
  if (row.user_id === userId) return { album: row, role: "owner", pending: false };
  if (row.member_role && (row.accepted_at || allowPending)) {
    return { album: row, role: row.member_role, pending: !row.accepted_at };
  }
  throw httpError(404, "Không tìm thấy album", "ALBUM_NOT_FOUND");
}

export function assertRole(access, roles, message = "Bạn không có quyền với album này") {
  if (!roles.includes(access.role) || access.pending) {
    throw httpError(403, message, "ALBUM_FORBIDDEN");
  }
}

export function assertManual(access) {
  if (access.album.kind === "smart") {
    throw httpError(
      400,
      "Album thông minh tự cập nhật theo truy vấn — chuyển thành album thường để sửa danh sách ảnh",
      "ALBUM_IS_SMART",
    );
  }
}
