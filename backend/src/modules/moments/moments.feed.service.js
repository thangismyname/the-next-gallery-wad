import { dbPool } from "../../config/db.js";
import {
  MOMENT_JOIN,
  COMPLETED_FILTER,
  DRAFT_TTL,
  MAX_REACTION_BUBBLES,
} from "./moments.constants.js";
import { toMomentItem } from "./moments.mapper.js";
import { attachSlots } from "./moments.query.service.js";

// Xoá draft collab quá hạn (tạo > 24h mà vẫn còn slot trống).
export async function cleanupExpiredDrafts() {
  const result = await dbPool.query(
    `DELETE FROM moments m
     USING moment_collab mc
     WHERE m.template <> 'single'
       AND m.created_at < NOW() - ($1::interval)
       AND mc.moment_id = m.id
       AND mc.filled_at IS NULL
     RETURNING m.id`,
    [DRAFT_TTL],
  );
  return result.rowCount ?? 0;
}

// ---- Reactions: gắn summary (reactions + myReaction) vào list items ----

// Gắn reaction summary cho 1 danh sách moment. Chạy 3 query nhỏ:
// (1) aggregate count theo emoji, (2) top-N reaction gần nhất kèm avatar user
//     (dùng cho bubble chồng nhau), (3) reaction của chính user hiện tại.
async function attachReactions(items, userId) {
  const ids = items.map((item) => item.id);
  if (ids.length === 0) return items;

  const aggResult = await dbPool.query(
    `SELECT moment_id, reaction_emoji AS emoji, COUNT(*)::int AS count
     FROM moment_reactions
     WHERE moment_id = ANY($1::uuid[]) AND reaction_emoji IS NOT NULL
     GROUP BY moment_id, reaction_emoji`,
    [ids],
  );

  const reactionsByMoment = new Map();
  for (const row of aggResult.rows) {
    const list = reactionsByMoment.get(row.moment_id) ?? [];
    list.push({ emoji: row.emoji, count: row.count });
    reactionsByMoment.set(row.moment_id, list);
  }

  const recentResult = await dbPool.query(
    `WITH recent AS (
       SELECT mr.moment_id, mr.reaction_emoji AS emoji,
              u.id AS user_id, u.name AS user_name, u.image AS user_avatar,
              mr.created_at,
              ROW_NUMBER() OVER (
                PARTITION BY mr.moment_id ORDER BY mr.created_at DESC
              ) AS rn
       FROM moment_reactions mr
       JOIN "user" u ON u.id = mr.user_id
       WHERE mr.moment_id = ANY($1::uuid[]) AND mr.reaction_emoji IS NOT NULL
     )
     SELECT moment_id, emoji,
            user_id, user_name, user_avatar
     FROM recent WHERE rn <= $2
     ORDER BY created_at DESC`,
    [ids, MAX_REACTION_BUBBLES],
  );

  const recentByMoment = new Map();
  for (const row of recentResult.rows) {
    const list = recentByMoment.get(row.moment_id) ?? [];
    list.push({
      emoji: row.emoji ?? null,
      userId: row.user_id,
      userName: row.user_name,
      userAvatarUrl: row.user_avatar || null,
    });
    recentByMoment.set(row.moment_id, list);
  }

  const mineResult = await dbPool.query(
    `SELECT moment_id, reaction_emoji AS emoji
     FROM moment_reactions
     WHERE moment_id = ANY($1::uuid[]) AND user_id = $2
       AND reaction_emoji IS NOT NULL`,
    [ids, userId],
  );
  const myMap = new Map();
  for (const row of mineResult.rows) {
    if (row.emoji) {
      myMap.set(row.moment_id, row.emoji);
    }
  }

  for (const item of items) {
    item.reactions = reactionsByMoment.get(item.id) ?? [];
    item.recentReactions = recentByMoment.get(item.id) ?? [];
    item.myReaction = myMap.get(item.id) ?? null;
  }
  return items;
}

// ---- Memes: gắn tổng số meme vào từng moment (hiện bên thẻ / nút flip) ----

async function attachMemeCounts(items) {
  const ids = items.map((item) => item.id);
  if (ids.length === 0) return items;
  const result = await dbPool.query(
    `SELECT moment_id, COUNT(*)::int AS cnt
     FROM moment_memes
     WHERE moment_id = ANY($1::uuid[])
     GROUP BY moment_id`,
    [ids],
  );
  const map = new Map(result.rows.map((r) => [r.moment_id, r.cnt]));
  for (const item of items) {
    item.memeCount = map.get(item.id) ?? 0;
  }
  return items;
}

// ---- Feed: moments của mình (mọi visibility) + bạn bè (circle/public) ----

export async function listMomentsFeed(userId, { limit = 40, offset = 0 }) {
  await cleanupExpiredDrafts().catch(() => {});
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
      ${COMPLETED_FILTER}
    ORDER BY m.created_at DESC
    LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );

  await attachSlots(result.rows);
  const items = result.rows.map((row) => toMomentItem(row, userId));
  await attachReactions(items, userId);
  await attachMemeCounts(items);
  return {
    items,
    hasMore: result.rows.length === limit,
    limit,
    offset,
  };
}

// ---- Invitations: moment collab tôi còn phải điền ảnh / đang chờ bạn ----

// Lấy draft collab (còn slot trống, chưa quá 24h) mà user liên quan:
// (a) moment tôi được mời điền slot còn trống, (b) moment tôi tạo đang chờ bạn.
export async function listMomentInvitations(userId) {
  await cleanupExpiredDrafts().catch(() => {});
  const result = await dbPool.query(
    `
    ${MOMENT_JOIN}
    WHERE m.template <> 'single'
      AND m.created_at > NOW() - ($2::interval)
      AND EXISTS (
        -- moment này vẫn còn slot trống (draft)
        SELECT 1 FROM moment_collab mc2
        WHERE mc2.moment_id = m.id AND mc2.filled_at IS NULL
      )
      AND (
        m.user_id = $1
        OR EXISTS (
          SELECT 1 FROM moment_collab mc
          WHERE mc.moment_id = m.id AND mc.user_id = $1 AND mc.filled_at IS NULL
        )
      )
    ORDER BY m.created_at DESC`,
    [userId, DRAFT_TTL],
  );

  await attachSlots(result.rows);
  let items = result.rows.map((row) => toMomentItem(row, userId));
  items = await attachReactions(items, userId);
  items = await attachMemeCounts(items);

  // Gắn thông tin "tôi đang giữ slot trống nào / tôi là creator chờ ai"
  for (const item of items) {
    const mySlots = item.slots.filter((s) => s.userId === userId && !s.filled);
    item.myPendingSlots = mySlots.map((s) => s.slotIndex);
    item.myPendingSlot = item.myPendingSlots[0] ?? null;
    item.pendingCount = item.slots.filter((s) => !s.filled).length;
  }
  return items;
}
