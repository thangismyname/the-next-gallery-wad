// Album chung: mời bạn bè (editor / viewer), nhận / từ chối lời mời, rời album.
import { dbPool } from "../../config/db.js";
import { assertRole, getAlbumAccess, httpError } from "./albums.access.js";
import { toMember } from "./albums.mapper.js";

// is_shared = còn ai khác ngoài owner (kể cả lời mời đang chờ).
async function syncShared(albumId) {
  await dbPool.query(
    `UPDATE albums
     SET is_shared = EXISTS (SELECT 1 FROM album_members WHERE album_id = $1),
         updated_at = NOW()
     WHERE id = $1`,
    [albumId],
  );
}

/** Owner + thành viên (kể cả lời mời đang chờ) — mọi người trong album đều xem được. */
export async function listMembers(userId, albumId) {
  const access = await getAlbumAccess(userId, albumId);
  const result = await dbPool.query(
    `SELECT a.user_id, 'owner' AS role, a.created_at AS invited_at,
            a.created_at AS accepted_at, u.name, u.email, u.image
     FROM albums a JOIN "user" u ON u.id = a.user_id
     WHERE a.id = $1
     UNION ALL
     SELECT m.user_id, m.role, m.invited_at, m.accepted_at, u.name, u.email, u.image
     FROM album_members m JOIN "user" u ON u.id = m.user_id
     WHERE m.album_id = $1`,
    [albumId],
  );
  const members = result.rows.map(toMember);
  // Chỉ owner thấy lời mời đang chờ.
  return access.role === "owner" ? members : members.filter((m) => !m.pending);
}

/**
 * Mời bạn bè (đã kết bạn) vào album. Đã là thành viên → chỉ đổi vai trò.
 * @returns {Promise<string[]>} id những người mới được mời (để gửi thông báo).
 */
export async function inviteMembers(userId, albumId, { userIds, role }) {
  const access = await getAlbumAccess(userId, albumId);
  assertRole(access, ["owner"]);
  const friends = await dbPool.query(
    `SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END AS friend_id
     FROM friendships
     WHERE status = 'accepted'
       AND (requester_id = $1 OR addressee_id = $1)`,
    [userId],
  );
  const friendIds = new Set(friends.rows.map((r) => String(r.friend_id)));
  const targets = [...new Set(userIds)].filter((id) => id !== userId);
  const notFriends = targets.filter((id) => !friendIds.has(id));
  if (notFriends.length) {
    throw httpError(400, "Chỉ mời được bạn bè vào album", "NOT_FRIENDS");
  }
  const result = await dbPool.query(
    `INSERT INTO album_members (album_id, user_id, role)
     SELECT $1, x, $3 FROM unnest($2::text[]) AS x
     ON CONFLICT (album_id, user_id) DO UPDATE SET role = EXCLUDED.role
     RETURNING user_id, (xmax = 0) AS inserted`,
    [albumId, targets, role],
  );
  await syncShared(albumId);
  return {
    album: access.album,
    invitedIds: result.rows.filter((r) => r.inserted).map((r) => String(r.user_id)),
  };
}

export async function updateMemberRole(userId, albumId, memberId, role) {
  const access = await getAlbumAccess(userId, albumId);
  assertRole(access, ["owner"]);
  const result = await dbPool.query(
    `UPDATE album_members SET role = $3 WHERE album_id = $1 AND user_id = $2`,
    [albumId, memberId, role],
  );
  if (result.rowCount === 0) throw httpError(404, "Không có thành viên này");
}

/** Owner gỡ thành viên, hoặc thành viên tự rời album (memberId = chính mình). */
export async function removeMember(userId, albumId, memberId) {
  const access = await getAlbumAccess(userId, albumId, { allowPending: true });
  if (memberId !== userId) assertRole(access, ["owner"]);
  if (memberId === access.album.user_id) {
    throw httpError(400, "Chủ album không thể rời album — hãy xoá album");
  }
  await dbPool.query(`DELETE FROM album_members WHERE album_id = $1 AND user_id = $2`, [
    albumId,
    memberId,
  ]);
  await syncShared(albumId);
}

/** Nhận / từ chối lời mời vào album. */
export async function respondInvitation(userId, albumId, accept) {
  const access = await getAlbumAccess(userId, albumId, { allowPending: true });
  if (access.role === "owner" || !access.pending) {
    throw httpError(400, "Không có lời mời nào đang chờ");
  }
  if (accept) {
    await dbPool.query(
      `UPDATE album_members SET accepted_at = NOW() WHERE album_id = $1 AND user_id = $2`,
      [albumId, userId],
    );
  } else {
    await removeMember(userId, albumId, userId);
  }
}
