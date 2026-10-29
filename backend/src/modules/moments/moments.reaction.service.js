import { dbPool } from "../../config/db.js";
import { canViewMoment } from "./moments.query.service.js";

// React 1 lần / moment (UNIQUE moment_id+user_id). Nếu đã có → cập nhật lại.
export async function createReaction(userId, momentId, { emoji = null }) {
  if (!emoji) {
    throw Object.assign(new Error("Phải có emoji"), {
      status: 400,
    });
  }

  if (!(await canViewMoment(userId, momentId))) {
    throw Object.assign(new Error("Không tìm thấy moment"), { status: 404 });
  }

  const cleanEmoji = String(emoji).slice(0, 10);
  const result = await dbPool.query(
    `INSERT INTO moment_reactions (moment_id, user_id, reaction_emoji)
     VALUES ($1, $2, $3)
     ON CONFLICT (moment_id, user_id)
     DO UPDATE SET
       reaction_emoji = EXCLUDED.reaction_emoji,
       created_at = now()
     RETURNING reaction_emoji`,
    [momentId, userId, cleanEmoji],
  );

  const row = result.rows[0];
  return {
    reacted: true,
    emoji: row.reaction_emoji ?? null,
  };
}

export async function deleteReaction(userId, momentId) {
  const result = await dbPool.query(
    `DELETE FROM moment_reactions WHERE moment_id = $1 AND user_id = $2 RETURNING id`,
    [momentId, userId],
  );
  return result.rowCount > 0;
}
