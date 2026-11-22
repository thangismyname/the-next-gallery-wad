import { dbPool } from "../../config/db.js";
import { updateMomentMeta } from "./moments.query.service.js";
import {
  COLLAB_SLOT_COUNT,
  DRAFT_TTL_MS,
  MOMENT_JOIN,
  slotFilledSql,
} from "./moments.constants.js";
import { toMomentItem } from "./moments.mapper.js";
import { attachSlots } from "./moments.query.service.js";
import { httpError } from "../../middleware/errorHandler.js";

// ---- Validate + chuẩn hoá payload moment (single / self-fill / collab) ----
// Dùng chung cho createMoment (tạo mới) và updateDraftMoment (chỉnh sửa draft).
// `db` = client của transaction khi gọi từ updateDraftMoment → đọc media/bạn bè
// trong CÙNG transaction (P2.5).
async function normalizeDraftPayload(userId, payload, db = dbPool) {
  const {
    template = "single",
    mediaId = null,
    mediaIds = [],
    framings = [],
    creatorSlots,
    collaboratorIds = [],
    caption,
    visibility = "circle",
  } = payload || {};

  const slotCount = COLLAB_SLOT_COUNT[template] ?? 1;
  const isCollab = template !== "single";
  let creatorMediaIds = [];

  if (!isCollab) {
    if (!mediaId) {
      throw httpError(400, null, "Thiếu ảnh cho moment");
    }
    creatorMediaIds = [mediaId];
  } else if (collaboratorIds.length === 0) {
    // Self-fill collage: chọn đủ ảnh bằng số slot
    if (mediaIds.length !== slotCount) {
      throw Object.assign(
        new Error(`Template ${template} cần ${slotCount} ảnh (self-fill)`),
        { status: 400 },
      );
    }
    creatorMediaIds = mediaIds;
  } else {
    // Collaborative: creator đăng 1..slotCount-1 ảnh từ các slot đầu,
    // bạn bè điền phần slot còn lại (mỗi bạn ít nhất 1 slot).
    // Số bạn linh hoạt — nếu bạn được chọn ít hơn số slot trống thì 1 bạn sẽ
    // điền nhiều ảnh (vd 3 ảnh + 1 bạn: bạn đăng 1-2 ảnh, người kia điền 2-1).
    creatorMediaIds = mediaIds.length > 0 ? mediaIds : mediaId ? [mediaId] : [];
    if (creatorMediaIds.length < 1 || creatorMediaIds.length > slotCount - 1) {
      throw Object.assign(
        new Error(`Bạn cần đăng từ 1 đến ${slotCount - 1} ảnh của mình`),
        { status: 400 },
      );
    }
    if (collaboratorIds.length < 1 || collaboratorIds.length > slotCount - 1) {
      throw Object.assign(
        new Error(`Template ${template} cần từ 1 đến ${slotCount - 1} bạn bè`),
        { status: 400 },
      );
    }
    if (creatorMediaIds.length + collaboratorIds.length > slotCount) {
      throw Object.assign(
        new Error(
          `Tổng ${creatorMediaIds.length} ảnh của bạn + ${collaboratorIds.length} người được mời vượt ${slotCount} slot`,
        ),
        { status: 400 },
      );
    }
    if (collaboratorIds.includes(userId)) {
      throw httpError(400, null, "Không thể mời chính mình");
    }
    if (new Set(collaboratorIds).size !== collaboratorIds.length) {
      throw httpError(400, null, "Bạn bè trùng lặp");
    }
  }

  // Ô của từng ảnh mình (mặc định các ô đầu) — phải khác nhau và nằm trong template.
  const slots = creatorSlots ?? creatorMediaIds.map((_, i) => i);
  if (
    slots.length !== creatorMediaIds.length ||
    new Set(slots).size !== slots.length ||
    slots.some((s) => s >= slotCount)
  ) {
    throw httpError(400, null, "Vị trí ô của ảnh không hợp lệ");
  }

  // --- Kiểm tra quyền sở hữu media ---
  const ownerMediaIds = creatorMediaIds;

  if (ownerMediaIds.length > 0) {
    const owned = await db.query(
      `SELECT id FROM media
       WHERE id = ANY($1::uuid[]) AND user_id = $2 AND deleted_at IS NULL`,
      [ownerMediaIds, userId],
    );
    if (owned.rows.length !== ownerMediaIds.length) {
      throw Object.assign(
        new Error("Không tìm thấy ảnh/video để đăng moment"),
        { status: 404 },
      );
    }
  }

  // --- Kiểm tra bạn bè (chỉ khi collaborative) ---
  if (collaboratorIds.length > 0) {
    const friends = await db.query(
      `SELECT addressee_id FROM friendships
       WHERE status = 'accepted'
         AND (
           (requester_id = $1 AND addressee_id = ANY($2::text[]))
           OR (requester_id = ANY($2::text[]) AND addressee_id = $1)
         )`,
      [userId, collaboratorIds],
    );
    if (friends.rows.length !== collaboratorIds.length) {
      throw Object.assign(
        new Error("Chỉ có thể mời bạn bè tham gia moment"),
        { status: 400 },
      );
    }
  }

  return {
    template,
    mediaId,
    mediaIds,
    creatorMediaIds,
    creatorFramings: creatorMediaIds.map((_, i) => framings[i] ?? null),
    creatorSlots: slots,
    collaboratorIds,
    caption,
    visibility,
    slotCount,
    isCollab,
    text: typeof caption === "string" ? caption.trim() : "",
  };
}

/** Ô trống (không phải của creator) → bạn bè theo thứ tự, chia đều (người đầu nhận phần dư). */
export function friendSlotPlan(slotCount, creatorSlots, collaboratorIds) {
  const free = Array.from({ length: slotCount }, (_, i) => i).filter((i) => !creatorSlots.includes(i));
  const n = collaboratorIds.length;
  const base = Math.floor(free.length / n);
  const rem = free.length % n;
  const plan = [];
  let k = 0;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < base + (i < rem ? 1 : 0); c++) plan.push({ slotIndex: free[k++], userId: collaboratorIds[i] });
  }
  return plan;
}

// Ghi các row moment_collab cho 1 moment (self-fill hoặc collab).
// Moment single không có collab — gọi với isCollab=false thì bỏ qua.
async function insertMomentSlots(client, momentId, userId, norm) {
  if (!norm.isCollab) return;

  // Creator chiếm các slot ĐẦU Tiên với ảnh của họ (1 ảnh trong self/2-ảnh tuỳ chọn),
  // phần slot còn lại chia cho bạn bè (mỗi người ít nhất 1 slot).
  const creatorMediaIds = norm.creatorMediaIds ?? [];
  const creatorSlots = norm.creatorSlots ?? creatorMediaIds.map((_, i) => i);
  for (let i = 0; i < creatorMediaIds.length; i++) {
    await client.query(
      `INSERT INTO moment_collab (moment_id, slot_index, user_id, media_id, filled_at, framing)
       VALUES ($1, $2, $3, $4, now(), $5)`,
      [momentId, creatorSlots[i], userId, creatorMediaIds[i], norm.creatorFramings?.[i] ?? null],
    );
  }

  if (norm.collaboratorIds.length === 0) return;

  // Ô còn lại (theo thứ tự trên → dưới) chia cho bạn bè, mỗi người ≥ 1 ô.
  const friendSlots = friendSlotPlan(norm.slotCount, creatorSlots, norm.collaboratorIds);
  for (const { slotIndex, userId: friendId } of friendSlots) {
    await client.query(
      `INSERT INTO moment_collab (moment_id, slot_index, user_id)
       VALUES ($1, $2, $3)`,
      [momentId, slotIndex, friendId],
    );
  }
}

// Nạp 1 moment (kèm slots + item response) theo id.
export async function getMomentItem(momentId, userId) {
  const rowResult = await dbPool.query(`${MOMENT_JOIN} WHERE m.id = $1`, [
    momentId,
  ]);
  if (rowResult.rows.length === 0) return null;
  await attachSlots(rowResult.rows);
  return toMomentItem(rowResult.rows[0], userId);
}

// Sửa caption/visibility của moment đã đăng (P3.1).
export async function patchMomentMeta(userId, momentId, patch) {
  const ok = await updateMomentMeta(userId, momentId, patch);
  if (!ok) return null;
  const item = await getMomentItem(momentId, userId);
  return item;
}

// ---- Tạo moment từ 1 ảnh/video đã có trong media của user ----
// Hỗ trợ template: single (mediaId), duo/trio self-fill (mediaIds đủ slot),
// duo/trio collab (mediaIds = 1..slotCount-1 ảnh của creator chiếm slot đầu
// + collaboratorIds điền phần slot còn lại).
export async function createMoment(userId, payload) {
  const norm = await normalizeDraftPayload(userId, payload);

  const client = await dbPool.connect();
  let momentId;
  // duo/trio: moments.media_id luôn NULL (CHECK chk_template_media) — ảnh nằm hết trong moment_collab
  const momentMediaId = norm.isCollab ? null : norm.mediaId;
  try {
    await client.query("BEGIN");
    const insertResult = await client.query(
      `INSERT INTO moments (user_id, media_id, template, caption, visibility, framing)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [userId, momentMediaId, norm.template, norm.text || null, norm.visibility, norm.isCollab ? null : norm.creatorFramings[0]],
    );
    momentId = insertResult.rows[0].id;

    await insertMomentSlots(client, momentId, userId, norm);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return getMomentItem(momentId, userId);
}

// ---- Chỉnh sửa draft moment collab (chưa đủ slot) do chính mình tạo ----
// Cho phép "quay lại edit" trước khi moment được hoàn thiện (vào feed):
// đổi template/ảnh của mình/caption/visibility/bạn bè → rebuild lại slots.
// Trả về { moment, previousCollaboratorIds } để route biết ai là bạn mới cần mời lại.
//
// Toàn bộ kiểm tra + ghi nằm trong 1 transaction, khoá row moments FOR UPDATE
// (P2.5): tránh TOCTOU "còn slot trống" rồi bạn điền hết trong lúc đó, và tránh
// xoá mất ảnh người khác khi đổi template.
export async function updateDraftMoment(userId, momentId, payload) {
  const client = await dbPool.connect();
  let previousCollaboratorIds = [];
  try {
    await client.query("BEGIN");

    const draft = await client.query(
      `SELECT m.id, m.template, m.created_at
       FROM moments m
       WHERE m.id = $1 AND m.user_id = $2
       FOR UPDATE`,
      [momentId, userId],
    );
    if (draft.rows.length === 0) {
      throw httpError(404, null, "Không tìm thấy moment");
    }
    const { template: currentTemplate, created_at: createdAt } = draft.rows[0];

    // Draft quá hạn → không cho sửa (khớp 410 của fillMomentSlots).
    if (new Date(createdAt) < new Date(Date.now() - DRAFT_TTL_MS)) {
      throw httpError(410, null, "Moment này đã hết hạn");
    }

    // Vẫn phải là draft (còn ít nhất 1 slot chưa có ảnh) mới sửa được.
    const incomplete = await client.query(
      `SELECT 1 FROM moment_collab mc
       WHERE mc.moment_id = $1 AND NOT ${slotFilledSql("mc")} LIMIT 1`,
      [momentId],
    );
    if (currentTemplate === "single" || incomplete.rowCount === 0) {
      throw httpError(409, null, "Moment đã hoàn chỉnh, không thể chỉnh sửa");
    }

    // Đổi template khi bạn bè đã điền ảnh → có thể làm mất ảnh của họ.
    if (payload.template && payload.template !== currentTemplate) {
      const others = await client.query(
        `SELECT 1 FROM moment_collab mc
         WHERE mc.moment_id = $1 AND mc.user_id <> $2
           AND ${slotFilledSql("mc")} LIMIT 1`,
        [momentId, userId],
      );
      if (others.rowCount > 0) {
        throw Object.assign(
          new Error("Không thể đổi template khi bạn bè đã điền ảnh"),
          { status: 409 },
        );
      }
    }

    const norm = await normalizeDraftPayload(userId, payload, client);
    if (!norm.isCollab || norm.collaboratorIds.length === 0) {
      throw Object.assign(
        new Error("Draft collab phải giữ chế độ cùng bạn bè điền ảnh"),
        { status: 400 },
      );
    }

    // Bạn bè hiện tại của draft (để biết ai được thêm mới khi edit)
    const previous = await client.query(
      `SELECT user_id FROM moment_collab
       WHERE moment_id = $1 AND user_id <> $2 AND user_id IS NOT NULL
       GROUP BY user_id`,
      [momentId, userId],
    );
    previousCollaboratorIds = previous.rows.map((r) => r.user_id);

    await client.query(`DELETE FROM moment_collab WHERE moment_id = $1`, [
      momentId,
    ]);
    await client.query(
      `UPDATE moments
       SET media_id = NULL, template = $2, caption = $3, visibility = $4
       WHERE id = $1`,
      [momentId, norm.template, norm.text || null, norm.visibility],
    );
    await insertMomentSlots(client, momentId, userId, norm);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  const moment = await getMomentItem(momentId, userId);
  return { moment, previousCollaboratorIds };
}

// ---- Điền ảnh vào các slot trống của chính mình (collab draft) ----

// user gửi mediaIds (1+ ảnh) để lấp tuần tự những slot trống của họ.
// 1 người giữ nhiều slot (vd 3 ảnh chỉ 1 bạn) thì gửi nhiều ảnh một lúc.
// Trả về { filled, complete, moment } — complete = moment giờ đủ slot (vào feed).
//
// Toàn bộ đọc slot → ghi slot → tính complete nằm trong 1 transaction, khoá cả
// moment lẫn các slot FOR UPDATE (P2.4): 2 request song song thì 1 thắng, 1 nhận
// lỗi; không có trạng thái nửa vời và không notify trùng.
export async function fillMomentSlots(userId, momentId, mediaIds, framings = [], slotIndexes) {
  const client = await dbPool.connect();
  let filled = 0;
  try {
    await client.query("BEGIN");

    // Khoá moment: tránh updateDraftMoment chen ngang giữa chừng.
    const momentResult = await client.query(
      `SELECT id, created_at FROM moments WHERE id = $1 FOR UPDATE`,
      [momentId],
    );
    if (momentResult.rows.length === 0) {
      throw httpError(404, null, "Không tìm thấy moment");
    }
    if (
      new Date(momentResult.rows[0].created_at) <
      new Date(Date.now() - DRAFT_TTL_MS)
    ) {
      throw httpError(410, null, "Moment này đã hết hạn");
    }

    // Có tham gia moment này không?
    const member = await client.query(
      `SELECT 1 FROM moment_collab WHERE moment_id = $1 AND user_id = $2 LIMIT 1`,
      [momentId, userId],
    );
    if (member.rowCount === 0) {
      throw Object.assign(
        new Error("Không tìm thấy slot của bạn để điền ảnh"),
        { status: 404 },
      );
    }

    // Các slot còn trống của tôi (khoá trong transaction).
    const slotResult = await client.query(
      `SELECT mc.slot_index
       FROM moment_collab mc
       WHERE mc.moment_id = $1 AND mc.user_id = $2
         AND mc.declined_at IS NULL
         AND NOT ${slotFilledSql("mc")}
       ORDER BY mc.slot_index
       FOR UPDATE`,
      [momentId, userId],
    );
    if (slotResult.rows.length === 0) {
      throw Object.assign(
        new Error("Bạn đã điền đủ ảnh cho moment này"),
        { status: 409 },
      );
    }

    if (mediaIds.length === 0 || mediaIds.length > slotResult.rows.length) {
      throw Object.assign(
        new Error(`Bạn chỉ có ${slotResult.rows.length} slot trống để điền ảnh`),
        { status: 400 },
      );
    }
    if (new Set(mediaIds).size !== mediaIds.length) {
      throw httpError(400, null, "Ảnh trùng lặp");
    }

    // Kiểm tra media đều thuộc về user
    const mediaResult = await client.query(
      `SELECT id FROM media WHERE id = ANY($1::uuid[]) AND user_id = $2 AND deleted_at IS NULL`,
      [mediaIds, userId],
    );
    if (mediaResult.rows.length !== mediaIds.length) {
      throw httpError(404, null, "Không tìm thấy ảnh/video để điền slot");
    }

    // Ô do người dùng chọn (phải là ô trống của mình, không trùng) hoặc lấp tuần tự.
    const mine = slotResult.rows.map((r) => r.slot_index);
    if (
      slotIndexes &&
      (slotIndexes.length !== mediaIds.length ||
        new Set(slotIndexes).size !== slotIndexes.length ||
        slotIndexes.some((s) => !mine.includes(s)))
    ) {
      throw httpError(400, null, "Ô được chọn không phải ô trống của bạn");
    }
    const targetSlots = slotIndexes
      ? slotIndexes.map((slot_index) => ({ slot_index }))
      : slotResult.rows.slice(0, mediaIds.length);
    for (let i = 0; i < targetSlots.length; i++) {
      await client.query(
        `UPDATE moment_collab
         SET media_id = $1, filled_at = now(), framing = $5
         WHERE moment_id = $2 AND slot_index = $3 AND user_id = $4`,
        [mediaIds[i], momentId, targetSlots[i].slot_index, userId, framings[i] ?? null],
      );
    }
    filled = targetSlots.length;

    // Đã đủ slot chưa? (tính trong transaction, coi slot mất ảnh là trống)
    const remaining = await client.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE NOT ${slotFilledSql("mc")})::int AS empty
       FROM moment_collab mc
       WHERE mc.moment_id = $1`,
      [momentId],
    );
    const { total, empty } = remaining.rows[0];
    const complete = total > 0 && empty === 0;

    await client.query("COMMIT");

    const moment = await getMomentItem(momentId, userId);
    return { filled, complete, moment };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// ---- Xóa moment của chính mình ----

// Người tạo HOẶC người tham gia (có ô trong moment ghép) xoá được cả moment chung / bản nháp.
export async function deleteMoment(userId, momentId) {
  const result = await dbPool.query(
    `DELETE FROM moments m
     WHERE m.id = $1
       AND (m.user_id = $2
            OR EXISTS (SELECT 1 FROM moment_collab mc WHERE mc.moment_id = m.id AND mc.user_id = $2))
     RETURNING id`,
    [momentId, userId],
  );
  return result.rowCount > 0;
}

/**
 * Người được mời từ chối: các ô còn trống của họ được đánh dấu `declined_at` (moment vẫn là draft,
 * hết là lời mời của họ). → { creatorId } để báo người tạo; null = không có ô nào để từ chối.
 */
export async function declineMoment(userId, momentId) {
  const { rows } = await dbPool.query(
    `UPDATE moment_collab mc SET declined_at = now()
     FROM moments m
     WHERE mc.moment_id = $1 AND m.id = mc.moment_id AND mc.user_id = $2 AND m.user_id <> $2
       AND mc.declined_at IS NULL AND NOT ${slotFilledSql("mc")}
     RETURNING m.user_id AS creator_id, m.caption, m.template`,
    [momentId, userId],
  );
  return rows.length ? { creatorId: rows[0].creator_id, caption: rows[0].caption, template: rows[0].template } : null;
}

// ---- Rời moment collab (gỡ ảnh của mình khỏi slot) ----
// Dành cho người được mời (không phải creator): gỡ toàn bộ ảnh của mình,
// moment quay về trạng thái chưa đủ slot (draft) — creator có thể mời/điều chỉnh lại.

export async function leaveMoment(userId, momentId) {
  const momentResult = await dbPool.query(
    `SELECT m.id, m.user_id, m.template
     FROM moments m WHERE m.id = $1`,
    [momentId],
  );
  if (momentResult.rows.length === 0) {
    throw httpError(404, null, "Không tìm thấy moment");
  }
  const moment = momentResult.rows[0];
  if (moment.template === "single") {
    throw httpError(400, null, "Không thể rời moment chỉ có 1 ảnh");
  }
  if (moment.user_id === userId) {
    throw Object.assign(
      new Error("Bạn là người tạo moment — hãy xóa nó nếu không muốn"),
      { status: 400 },
    );
  }

  const slotResult = await dbPool.query(
    `SELECT slot_index FROM moment_collab
     WHERE moment_id = $1 AND user_id = $2`,
    [momentId, userId],
  );
  if (slotResult.rows.length === 0) {
    throw httpError(404, null, "Bạn không tham gia moment này");
  }

  await dbPool.query(
    `UPDATE moment_collab
     SET media_id = NULL, filled_at = NULL
     WHERE moment_id = $1 AND user_id = $2`,
    [momentId, userId],
  );

  return getMomentItem(momentId, userId);
}
