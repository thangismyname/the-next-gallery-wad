// Thông báo lưu trong DB (khác toast WS chỉ hiện khi đang online): người nhận xem lại được và
// tự xoá. Hiện có: `moment_deleted` (ai đó xoá moment mình cùng đăng), `moment_declined`
// (người được mời từ chối moment của mình).
import { dbPool } from "../../config/db.js";
import { sendToUser } from "../../ws/services/signaling.service.js";

export const NOTIFICATION_EVENT = "notification:new";
const KEEP_DAYS = 30;
const LIST_MAX = 50;

/**
 * Tạo 1 thông báo cho mỗi người nhận (trừ chính `actor`) + đẩy WS cho ai đang online (kèm tên
 * người gây ra để hiện toast ngay). Lỗi chỉ ném cho caller log.
 */
export async function notify(userIds, type, actor, payload) {
  const actorId = actor?.id ?? null;
  const ids = [...new Set(userIds)].filter((id) => id && id !== actorId);
  if (!ids.length) return;
  const { rows } = await dbPool.query(
    `INSERT INTO notifications (user_id, type, actor_id, payload)
     SELECT unnest($1::text[]), $2, $3, $4
     RETURNING id, user_id`,
    [ids, type, actorId, payload],
  );
  for (const row of rows) {
    sendToUser(row.user_id, NOTIFICATION_EVENT, { id: row.id, type, actorName: actor?.name ?? null, payload });
  }
}

/** 50 thông báo mới nhất (kèm người gây ra). Thông báo quá 30 ngày bị dọn ở đây. */
export async function listNotifications(userId) {
  // shortcut: dọn lúc đọc thay vì job định kỳ — đủ khi mỗi người ít thông báo.
  await dbPool.query(
    `DELETE FROM notifications WHERE user_id = $1 AND created_at < NOW() - make_interval(days => $2)`,
    [userId, KEEP_DAYS],
  );
  const { rows } = await dbPool.query(
    `SELECT n.id, n.type, n.payload, n.created_at, n.actor_id, u.name AS actor_name, u.image AS actor_image
     FROM notifications n LEFT JOIN "user" u ON u.id = n.actor_id
     WHERE n.user_id = $1
     ORDER BY n.created_at DESC
     LIMIT $2`,
    [userId, LIST_MAX],
  );
  return {
    items: rows.map((r) => ({
      id: r.id,
      type: r.type,
      payload: r.payload ?? {},
      createdAt: r.created_at,
      actor: r.actor_id ? { id: r.actor_id, name: r.actor_name, image: r.actor_image } : null,
    })),
  };
}

export async function deleteNotification(userId, id) {
  const { rowCount } = await dbPool.query(`DELETE FROM notifications WHERE id = $1 AND user_id = $2`, [id, userId]);
  return { removed: rowCount > 0 };
}

export async function clearNotifications(userId) {
  const { rowCount } = await dbPool.query(`DELETE FROM notifications WHERE user_id = $1`, [userId]);
  return { removed: rowCount };
}
