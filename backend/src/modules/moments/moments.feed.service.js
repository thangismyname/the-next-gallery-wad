import { dbPool } from "../../config/db.js";
import {
  MOMENT_JOIN,
  COMPLETED_FILTER,
  DRAFT_TTL,
  MAX_REACTION_BUBBLES,
  SINGLE_MEDIA_VISIBLE,
  slotFilledSql,
} from "./moments.constants.js";
import { toMomentItem } from "./moments.mapper.js";
import { attachSlots } from "./moments.query.service.js";

// Xoá draft collab quá hạn (tạo > 24h mà vẫn còn slot trống). Chạy trong job
// định kỳ (moments.jobs.js) — KHÔNG chạy trên đường đọc feed nữa (P2.8).
export async function cleanupExpiredDrafts() {
  const result = await dbPool.query(
    `DELETE FROM moments m
     USING moment_collab mc
     WHERE m.template <> 'single'
       AND m.created_at < NOW() - ($1::interval)
       AND mc.moment_id = m.id
       AND NOT ${slotFilledSql("mc")}
     RETURNING m.id`,
    [DRAFT_TTL],
  );
  return result.rowCount ?? 0;
}

// ---- Reactions: gắn summary (reactions + recentReactions + myReaction) ----
// 1 query duy nhất cho cả 3 phần (aggregate count, top-N gần nhất, reaction
// của tôi) bằng CTE + json_agg — trước đây là 3 round-trip / trang (P2.8).
async function attachReactions(items, userId) {
  const ids = items.map((item) => item.id);
  if (ids.length === 0) return items;

  const result = await dbPool.query(
    `WITH agg AS (
       SELECT moment_id,
              json_agg(json_build_object('emoji', emoji, 'count', cnt)
                       ORDER BY cnt DESC) AS reactions
       FROM (
         SELECT moment_id, reaction_emoji AS emoji, COUNT(*)::int AS cnt
         FROM moment_reactions
         WHERE moment_id = ANY($1::uuid[]) AND reaction_emoji IS NOT NULL
         GROUP BY moment_id, reaction_emoji
       ) x
       GROUP BY moment_id
     ),
     recent AS (
       SELECT moment_id,
              json_agg(json_build_object(
                'emoji', emoji,
                'userId', user_id,
                'userName', user_name,
                'userAvatarUrl', user_avatar
              ) ORDER BY created_at DESC) AS recent
       FROM (
         SELECT mr.moment_id, mr.reaction_emoji AS emoji, u.id AS user_id,
                u.name AS user_name, u.image AS user_avatar, mr.created_at,
                ROW_NUMBER() OVER (
                  PARTITION BY mr.moment_id ORDER BY mr.created_at DESC
                ) AS rn
         FROM moment_reactions mr
         JOIN "user" u ON u.id = mr.user_id
         WHERE mr.moment_id = ANY($1::uuid[]) AND mr.reaction_emoji IS NOT NULL
       ) y
       WHERE rn <= $2
       GROUP BY moment_id
     ),
     mine AS (
       SELECT moment_id, MAX(reaction_emoji) AS emoji
       FROM moment_reactions
       WHERE moment_id = ANY($1::uuid[]) AND user_id = $3
         AND reaction_emoji IS NOT NULL
       GROUP BY moment_id
     )
     SELECT t.moment_id, agg.reactions, recent.recent, mine.emoji AS my_reaction
     FROM unnest($1::uuid[]) AS t(moment_id)
     LEFT JOIN agg ON agg.moment_id = t.moment_id
     LEFT JOIN recent ON recent.moment_id = t.moment_id
     LEFT JOIN mine ON mine.moment_id = t.moment_id`,
    [ids, MAX_REACTION_BUBBLES, userId],
  );

  const byMoment = new Map(result.rows.map((row) => [row.moment_id, row]));
  for (const item of items) {
    const row = byMoment.get(item.id);
    item.reactions = row?.reactions ?? [];
    item.recentReactions = row?.recent ?? [];
    item.myReaction = row?.my_reaction ?? null;
  }
  return items;
}

// ---- Feed: moments của mình (mọi visibility) + bạn bè (circle/public) ----

export async function listMomentsFeed(userId, { limit = 40, offset = 0 }) {
  // Fetch limit + 1 để kiểm tra hasMore.
  const fetchLimit = limit + 1;
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
    ${MOMENT_JOIN}
    WHERE (m.expires_at IS NULL OR m.expires_at > NOW())
      AND (
        m.user_id = $1
        OR (
          m.user_id IN (SELECT fid FROM friend_ids)
          AND m.visibility IN ('circle', 'public')
        )
      )
      AND ${SINGLE_MEDIA_VISIBLE}
      ${COMPLETED_FILTER}
    ORDER BY m.created_at DESC
    LIMIT $2 OFFSET $3`,
    [userId, fetchLimit, offset],
  );

  // Chỉ attach cho các row thực sự trả về (bỏ row limit + 1 dùng kiểm hasMore).
  const rows = result.rows.slice(0, limit);
  await attachSlots(rows);
  const items = rows.map((row) => toMomentItem(row, userId));
  await attachReactions(items, userId);

  return {
    items,
    hasMore: result.rows.length > limit,
    limit,
    offset,
  };
}

// ---- Invitations: moment collab tôi còn phải điền ảnh / đang chờ bạn ----

// Lấy draft collab (còn slot trống, chưa quá 24h) mà user liên quan:
// (a) moment tôi được mời điền slot còn trống, (b) moment tôi tạo đang chờ bạn.
// Phân trang như feed (limit + 1 → hasMore).
export async function listMomentInvitations(userId, { limit = 20, offset = 0 } = {}) {
  const fetchLimit = limit + 1;
  const result = await dbPool.query(
    `
    ${MOMENT_JOIN}
    WHERE m.template <> 'single'
      AND m.created_at > NOW() - ($2::interval)
      AND EXISTS (
        -- moment này vẫn còn slot trống (draft)
        SELECT 1 FROM moment_collab mc2
        WHERE mc2.moment_id = m.id AND NOT ${slotFilledSql("mc2")}
      )
      AND (
        m.user_id = $1
        OR EXISTS (
          SELECT 1 FROM moment_collab mc3
          WHERE mc3.moment_id = m.id AND mc3.user_id = $1
            AND NOT ${slotFilledSql("mc3")}
        )
      )
    ORDER BY m.created_at DESC
    LIMIT $3 OFFSET $4`,
    [userId, DRAFT_TTL, fetchLimit, offset],
  );

  const rows = result.rows.slice(0, limit);
  await attachSlots(rows);
  let items = rows.map((row) => toMomentItem(row, userId));
  items = await attachReactions(items, userId);

  // Gắn thông tin "tôi đang giữ slot trống nào / tôi là creator chờ ai"
  for (const item of items) {
    const mySlots = item.slots.filter((s) => s.userId === userId && !s.filled);
    item.myPendingSlots = mySlots.map((s) => s.slotIndex);
    item.myPendingSlot = item.myPendingSlots[0] ?? null;
    item.pendingCount = item.slots.filter((s) => !s.filled).length;
  }
  return {
    items,
    hasMore: result.rows.length > limit,
    limit,
    offset,
  };
}

// Số lời mời đang chờ — dùng cho badge sidebar (không cần tải cả list).
export async function countMomentInvitations(userId) {
  const result = await dbPool.query(
    `
    SELECT COUNT(*)::int AS cnt
    FROM moments m
    WHERE m.template <> 'single'
      AND m.created_at > NOW() - ($2::interval)
      AND EXISTS (
        SELECT 1 FROM moment_collab mc2
        WHERE mc2.moment_id = m.id AND NOT ${slotFilledSql("mc2")}
      )
      AND (
        m.user_id = $1
        OR EXISTS (
          SELECT 1 FROM moment_collab mc3
          WHERE mc3.moment_id = m.id AND mc3.user_id = $1
            AND NOT ${slotFilledSql("mc3")}
        )
      )`,
    [userId, DRAFT_TTL],
  );
  return result.rows[0]?.cnt ?? 0;
}
