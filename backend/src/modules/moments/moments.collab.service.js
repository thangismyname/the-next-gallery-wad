import { dbPool } from "../../config/db.js";
import { COLLAB_SLOT_COUNT, MOMENT_JOIN } from "./moments.constants.js";
import { toMomentItem } from "./moments.mapper.js";
import { attachSlots } from "./moments.query.service.js";

// ---- Validate + chuẩn hoá payload moment (single / self-fill / collab) ----
// Dùng chung cho createMoment (tạo mới) và updateDraftMoment (chỉnh sửa draft).
async function normalizeDraftPayload(userId, payload) {
  const {
    template = "single",
    mediaId = null,
    mediaIds = [],
    collaboratorIds = [],
    caption,
    visibility = "circle",
  } = payload || {};

  const slotCount = COLLAB_SLOT_COUNT[template] ?? 1;
  const isCollab = template !== "single";
  let creatorMediaIds = [];

  if (!isCollab) {
    if (!mediaId) {
      throw Object.assign(new Error("Thiếu ảnh cho moment"), { status: 400 });
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
      throw Object.assign(new Error("Không thể mời chính mình"), {
        status: 400,
      });
    }
    if (new Set(collaboratorIds).size !== collaboratorIds.length) {
      throw Object.assign(new Error("Bạn bè trùng lặp"), { status: 400 });
    }
  }

  // --- Kiểm tra quyền sở hữu media ---
  const ownerMediaIds = creatorMediaIds;

  if (ownerMediaIds.length > 0) {
    const owned = await dbPool.query(
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
    const friends = await dbPool.query(
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
    collaboratorIds,
    caption,
    visibility,
    slotCount,
    isCollab,
    text: typeof caption === "string" ? caption.trim() : "",
  };
}

// Ghi các row moment_collab cho 1 moment (self-fill hoặc collab).
// Moment single không có collab — gọi với isCollab=false thì bỏ qua.
async function insertMomentSlots(client, momentId, userId, norm) {
  if (!norm.isCollab) return;

  // Creator chiếm các slot ĐẦU Tiên với ảnh của họ (1 ảnh trong self/2-ảnh tuỳ chọn),
  // phần slot còn lại chia cho bạn bè (mỗi người ít nhất 1 slot).
  const creatorMediaIds = norm.creatorMediaIds ?? [];
  for (let i = 0; i < creatorMediaIds.length; i++) {
    await client.query(
      `INSERT INTO moment_collab (moment_id, slot_index, user_id, media_id, filled_at)
       VALUES ($1, $2, $3, $4, now())`,
      [momentId, i, userId, creatorMediaIds[i]],
    );
  }

  if (norm.collaboratorIds.length === 0) return;

  const friendSlots = norm.slotCount - creatorMediaIds.length;
  const n = norm.collaboratorIds.length;
  const base = Math.floor(friendSlots / n);
  const rem = friendSlots % n;
  let slotIdx = creatorMediaIds.length;
  for (let i = 0; i < n; i++) {
    const slots = base + (i < rem ? 1 : 0);
    for (let k = 0; k < slots; k++) {
      await client.query(
        `INSERT INTO moment_collab (moment_id, slot_index, user_id)
         VALUES ($1, $2, $3)`,
        [momentId, slotIdx, norm.collaboratorIds[i]],
      );
      slotIdx += 1;
    }
  }
}

// Nạp 1 moment (kèm slots + item response) theo id.
async function getMomentItem(momentId, userId) {
  const rowResult = await dbPool.query(`${MOMENT_JOIN} WHERE m.id = $1`, [
    momentId,
  ]);
  if (rowResult.rows.length === 0) return null;
  await attachSlots(rowResult.rows);
  return toMomentItem(rowResult.rows[0], userId);
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
      `INSERT INTO moments (user_id, media_id, template, caption, visibility)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, created_at`,
      [userId, momentMediaId, norm.template, norm.text || null, norm.visibility],
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
export async function updateDraftMoment(userId, momentId, payload) {
  const draft = await dbPool.query(
    `SELECT m.id, m.template
     FROM moments m
     WHERE m.id = $1 AND m.user_id = $2`,
    [momentId, userId],
  );
  if (draft.rows.length === 0) {
    throw Object.assign(new Error("Không tìm thấy moment"), { status: 404 });
  }

  // Chỉ cho chỉnh sửa khi vẫn còn draft (more 1 slot trống) — moment đủ ảnh rồi thì không đổi được.
  const incomplete = await dbPool.query(
    `SELECT 1 FROM moment_collab mc
     WHERE mc.moment_id = $1 AND mc.filled_at IS NULL LIMIT 1`,
    [momentId],
  );
  if (draft.rows[0].template === "single" || incomplete.rowCount === 0) {
    throw Object.assign(new Error("Moment đã hoàn chỉnh, không thể chỉnh sửa"), {
      status: 409,
    });
  }

  const norm = await normalizeDraftPayload(userId, payload);
  if (!norm.isCollab || norm.collaboratorIds.length === 0) {
    throw Object.assign(
      new Error("Draft collab phải giữ chế độ cùng bạn bè điền ảnh"),
      { status: 400 },
    );
  }

  // Bạn bè hiện tại của draft (để biết ai được thêm mới khi edit)
  const previous = await dbPool.query(
    `SELECT user_id FROM moment_collab
     WHERE moment_id = $1 AND user_id <> $2 AND user_id IS NOT NULL
     GROUP BY user_id`,
    [momentId, userId],
  );
  const previousCollaboratorIds = previous.rows.map((r) => r.user_id);

  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
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
    await client.query("ROLLBACK");
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
export async function fillMomentSlots(userId, momentId, mediaIds) {
  // Các slot trống của user hiện tại trong moment (sắp theo thứ tự ô)
  const slotResult = await dbPool.query(
    `SELECT mc.slot_index, m.created_at
     FROM moment_collab mc
     JOIN moments m ON m.id = mc.moment_id
     WHERE mc.moment_id = $1 AND mc.user_id = $2 AND mc.filled_at IS NULL
     ORDER BY mc.slot_index`,
    [momentId, userId],
  );
  if (slotResult.rows.length === 0) {
    throw Object.assign(
      new Error("Không tìm thấy slot của bạn để điền ảnh"),
      { status: 404 },
    );
  }

  const firstSlot = slotResult.rows[0];
  if (firstSlot.created_at < new Date(Date.now() - 24 * 3600 * 1000)) {
    throw Object.assign(new Error("Moment này đã hết hạn"), { status: 410 });
  }

  if (mediaIds.length === 0 || mediaIds.length > slotResult.rows.length) {
    throw Object.assign(
      new Error(`Bạn chỉ có ${slotResult.rows.length} slot trống để điền ảnh`),
      { status: 400 },
    );
  }
  if (new Set(mediaIds).size !== mediaIds.length) {
    throw Object.assign(new Error("Ảnh trùng lặp"), { status: 400 });
  }

  // Kiểm tra media đều thuộc về user
  const mediaResult = await dbPool.query(
    `SELECT id FROM media WHERE id = ANY($1::uuid[]) AND user_id = $2 AND deleted_at IS NULL`,
    [mediaIds, userId],
  );
  if (mediaResult.rows.length !== mediaIds.length) {
    throw Object.assign(new Error("Không tìm thấy ảnh/video để điền slot"), {
      status: 404,
    });
  }

  // Lấp tuần tự các slot trống (ô đầu tiên ↔ ảnh đầu tiên)
  const targetSlots = slotResult.rows.slice(0, mediaIds.length);
  for (let i = 0; i < targetSlots.length; i++) {
    await dbPool.query(
      `UPDATE moment_collab
       SET media_id = $1, filled_at = now()
       WHERE moment_id = $2 AND slot_index = $3 AND user_id = $4`,
      [mediaIds[i], momentId, targetSlots[i].slot_index, userId],
    );
  }

  // Kiểm tra đã đủ slot chưa
  const remaining = await dbPool.query(
    `SELECT COUNT(*)::int AS cnt FROM moment_collab
     WHERE moment_id = $1 AND filled_at IS NULL`,
    [momentId],
  );
  const complete = remaining.rows[0].cnt === 0;

  const rowResult = await dbPool.query(`${MOMENT_JOIN} WHERE m.id = $1`, [momentId]);
  await attachSlots(rowResult.rows);
  const moment = toMomentItem(rowResult.rows[0], userId);
  return { filled: targetSlots.length, complete, moment };
}

// ---- Xóa moment của chính mình ----

export async function deleteMoment(userId, momentId) {
  const result = await dbPool.query(
    `DELETE FROM moments WHERE id = $1 AND user_id = $2 RETURNING id`,
    [momentId, userId],
  );
  return result.rowCount > 0;
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
    throw Object.assign(new Error("Không tìm thấy moment"), { status: 404 });
  }
  const moment = momentResult.rows[0];
  if (moment.template === "single") {
    throw Object.assign(new Error("Không thể rời moment chỉ có 1 ảnh"), {
      status: 400,
    });
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
    throw Object.assign(new Error("Bạn không tham gia moment này"), {
      status: 404,
    });
  }

  await dbPool.query(
    `UPDATE moment_collab
     SET media_id = NULL, filled_at = NULL
     WHERE moment_id = $1 AND user_id = $2`,
    [momentId, userId],
  );

  return getMomentItem(momentId, userId);
}
