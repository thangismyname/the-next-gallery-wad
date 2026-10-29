// Truy vấn dùng chung cho các service moments (feed/collab/reaction/meme):
// gắn slot collab vào rows và kiểm tra quyền xem.
import { dbPool } from "../../config/db.js";
import { COMPLETED_FILTER } from "./moments.constants.js";
import { toSlotItem } from "./moments.mapper.js";

// Gắn moment_collab slots vào rows (mutation: row._slots). Moment single → slots [].
export async function attachSlots(rows) {
  const ids = rows
    .filter((row) => row.template && row.template !== "single")
    .map((row) => row.id);
  if (ids.length === 0) {
    for (const row of rows) row._slots = row._slots ?? [];
    return rows;
  }

  const result = await dbPool.query(
    `SELECT mc.moment_id, mc.slot_index, mc.user_id, mc.media_id, mc.filled_at,
            u.name AS user_name, u.image AS user_avatar,
            med.media_type, med.width, med.height, med.duration_seconds
     FROM moment_collab mc
     JOIN "user" u ON u.id = mc.user_id
     LEFT JOIN media med ON med.id = mc.media_id AND med.deleted_at IS NULL
     WHERE mc.moment_id = ANY($1::uuid[])
     ORDER BY mc.moment_id, mc.slot_index`,
    [ids],
  );

  const slotsByMoment = new Map();
  for (const r of result.rows) {
    const list = slotsByMoment.get(r.moment_id) ?? [];
    list.push(toSlotItem(r));
    slotsByMoment.set(r.moment_id, list);
  }

  for (const row of rows) {
    row._slots = slotsByMoment.get(row.id) ?? [];
  }
  return rows;
}

// Kiểm tra user hiện tại có QUYỀN xem moment này không (mình hoặc
// bạn bè + visibility circle/public, chưa hết hạn, và moment đã hoàn chỉnh).
export async function canViewMoment(userId, momentId) {
  const result = await dbPool.query(
    `
    WITH friend_ids AS (
      SELECT CASE
        WHEN requester_id = $1 THEN addressee_id
        ELSE requester_id
      END AS fid
      FROM friendships
      WHERE (requester_id = $1 OR addressee_id = $1)
        AND status = 'accepted'
    )
    SELECT 1 FROM moments m
    WHERE m.id = $2
      AND (m.expires_at IS NULL OR m.expires_at > NOW())
      AND (
        m.user_id = $1
        OR (m.user_id IN (SELECT fid FROM friend_ids) AND m.visibility IN ('circle', 'public'))
      )
      ${COMPLETED_FILTER}`,
    [userId, momentId],
  );
  return result.rowCount > 0;
}

// Danh sách user liên quan trực tiếp tới moment (owner + người trong collab)
// — dùng để WS broadcast khi có meme mới/xóa.
export async function getMomentParticipantIds(momentId) {
  const result = await dbPool.query(
    `SELECT user_id FROM moments WHERE id = $1
     UNION
     SELECT user_id FROM moment_collab
     WHERE moment_id = $1 AND user_id IS NOT NULL`,
    [momentId],
  );
  return result.rows.map((r) => r.user_id);
}
