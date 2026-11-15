import { dbPool } from "../../config/db.js";
import { canViewMoment } from "./moments.query.service.js";
import { httpError } from "../../middleware/errorHandler.js";

// React 1 lần / moment (UNIQUE moment_id+user_id). Nếu đã có → cập nhật lại.
export async function createReaction(userId, momentId, { emoji = null }) {
  if (!emoji) {
    throw httpError(400, null, "Phải có emoji");
  }

  if (!(await canViewMoment(userId, momentId))) {
    throw httpError(404, null, "Không tìm thấy moment");
  }

  const cleanEmoji = String(emoji).trim();
  // Chỉ chấp nhận 1 grapheme emoji: Extended_Pictographic + tuỳ chọn skin tone
  // modifier + variation selector + ZWJ sequence.
  if (
    !/^\p{Extended_Pictographic}[\u{1F3FB}-\u{1F3FF}]?(\u200d\p{Extended_Pictographic}[\u{1F3FB}-\u{1F3FF}]?)*\uFE0F?$/u.test(
      cleanEmoji,
    )
  ) {
    throw httpError(400, null, "Emoji không hợp lệ");
  }
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
