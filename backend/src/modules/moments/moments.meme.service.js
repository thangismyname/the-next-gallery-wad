import { dbPool } from "../../config/db.js";
import { canViewMoment } from "./moments.query.service.js";

// ---- Meme templates — memegen.link (không cần auth) ----
const MEMEGEN_BASE = "https://api.memegen.link";
const MEMEGEN_TIMEOUT = 10_000;
const MEME_TEMPLATES_TTL = 6 * 60 * 60 * 1000; // 6h
let memeTemplatesCache = { data: null, at: 0 };

// Chuyển 1 row moment_memes (+ user) → object meme trả về cho FE.
function toMemeItem(row, userId) {
  return {
    id: String(row.id),
    momentId: String(row.moment_id),
    userId: row.user_id,
    userName: row.user_name,
    userAvatarUrl: row.user_avatar || null,
    imageUrl: row.image_url,
    templateId: row.template_id ?? null,
    caption: row.caption ?? null,
    createdAt: row.created_at ?? null,
    isOwn: row.user_id === userId,
    reactCount: 0,
    myReact: false,
    reactNames: [],
  };
}

// Danh sách template meme từ memegen.link (cache 6h, fallback dữ liệu cũ khi lỗi mạng).
export async function fetchMemeTemplates() {
  if (
    memeTemplatesCache.data &&
    Date.now() - memeTemplatesCache.at < MEME_TEMPLATES_TTL
  ) {
    return memeTemplatesCache.data;
  }

  let rows = [];
  try {
    const res = await fetch(`${MEMEGEN_BASE}/templates`, {
      signal: AbortSignal.timeout(MEMEGEN_TIMEOUT),
    });
    if (!res.ok) throw new Error("HTTP error");
    rows = await res.json();
  } catch (error) {
    if (memeTemplatesCache.data) return memeTemplatesCache.data; // stale fallback
    throw Object.assign(
      new Error("Không tải được template meme từ nguồn ngoài"),
      { status: 502 },
    );
  }

  const items = (Array.isArray(rows) ? rows : []).map((r) => ({
    id: r.id,
    name: r.name,
    lines: r.lines ?? 2,
    blankUrl: r.blank ?? `${MEMEGEN_BASE}/images/${r.id}.jpg`,
  }));
  memeTemplatesCache = { data: items, at: Date.now() };
  return items;
}

// Danh sách meme của 1 moment (mới → cũ, phân trang cho scroll vô hạn).
export async function listMomentMemes(userId, momentId, { limit = 20, offset = 0 }) {
  if (!(await canViewMoment(userId, momentId))) {
    return { items: [], hasMore: false, limit, offset };
  }

  const result = await dbPool.query(
    `SELECT mm.id, mm.moment_id, mm.user_id, mm.image_url, mm.template_id,
            mm.caption, mm.created_at,
            u.name AS user_name, u.image AS user_avatar
     FROM moment_memes mm
     JOIN "user" u ON u.id = mm.user_id
     WHERE mm.moment_id = $1
     ORDER BY mm.created_at DESC
     LIMIT $2 OFFSET $3`,
    [momentId, limit, offset],
  );

  const items = result.rows.map((row) => toMemeItem(row, userId));
  await attachMemeReactions(items, userId);
  return { items, hasMore: result.rows.length === limit, limit, offset };
}

// Gắn thông tin tim (❤️) cho danh sách meme của 1 page:
// reactCount = tổng số tim, myReact = user hiện tại đã tim chưa,
// reactNames = list tên người tim (tối đa 3, để tooltip "ai đã tim").
async function attachMemeReactions(items, userId) {
  if (items.length === 0) return;
  const ids = items.map((item) => item.id);

  const countResult = await dbPool.query(
    `SELECT meme_id, COUNT(*)::int AS cnt
     FROM meme_reactions
     WHERE meme_id = ANY($1::uuid[])
     GROUP BY meme_id`,
    [ids],
  );
  const countMap = new Map(countResult.rows.map((r) => [String(r.meme_id), r.cnt]));

  const nameResult = await dbPool.query(
    `SELECT mr.meme_id, u.name
     FROM meme_reactions mr
     JOIN "user" u ON u.id = mr.user_id
     WHERE mr.meme_id = ANY($1::uuid[])
       AND mr.user_id <> $2
     ORDER BY mr.created_at DESC`,
    [ids, userId],
  );
  const namesMap = new Map();
  for (const r of nameResult.rows) {
    const key = String(r.meme_id);
    if (!namesMap.has(key)) namesMap.set(key, []);
    if (namesMap.get(key).length < 3) namesMap.get(key).push(r.name);
  }

  for (const item of items) {
    item.reactCount = countMap.get(item.id) ?? 0;
  }

  // myReact chính xác: user hiện tại đã tim meme đó chưa.
  const myResult = await dbPool.query(
    `SELECT meme_id FROM meme_reactions WHERE user_id = $1 AND meme_id = ANY($2::uuid[])`,
    [userId, ids],
  );
  const mySet = new Set(myResult.rows.map((r) => String(r.meme_id)));
  for (const item of items) {
    item.myReact = mySet.has(item.id);
    item.reactNames = namesMap.get(item.id) ?? [];
  }
}

// Bấm tim (❤️) 1 meme — toggle: đã tim thì bỏ tim. Trả trạng thái mới.
export async function toggleMemeReaction(userId, memeId) {
  const exists = await dbPool.query(
    `SELECT moment_id FROM moment_memes WHERE id = $1`,
    [memeId],
  );
  // Meme của moment mình không được xem → 404 như không tồn tại.
  if (exists.rowCount === 0 || !(await canViewMoment(userId, exists.rows[0].moment_id))) {
    throw Object.assign(new Error("Không tìm thấy meme"), { status: 404 });
  }

  const inserted = await dbPool.query(
    `INSERT INTO meme_reactions (meme_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (meme_id, user_id) DO NOTHING`,
    [memeId, userId],
  );
  const liked = inserted.rowCount > 0;
  if (!liked) {
    await dbPool.query(
      `DELETE FROM meme_reactions WHERE meme_id = $1 AND user_id = $2`,
      [memeId, userId],
    );
  }

  const countResult = await dbPool.query(
    `SELECT COUNT(*)::int AS cnt FROM meme_reactions WHERE meme_id = $1`,
    [memeId],
  );
  return { myReact: liked, reactCount: countResult.rows[0].cnt };
}

// Tạo meme: gọi memegen.link render ảnh từ template + dòng chữ, rồi lưu URL.
export async function createMomentMeme(userId, momentId, { templateId, lines, caption }) {
  if (!(await canViewMoment(userId, momentId))) {
    throw Object.assign(new Error("Không tìm thấy moment"), { status: 404 });
  }

  const genParams = new URLSearchParams();
  genParams.set("template_id", templateId);
  for (const line of lines) {
    const text = String(line).trim();
    if (text) genParams.append("text[]", text);
  }

  let imageUrl;
  try {
    const res = await fetch(`${MEMEGEN_BASE}/images`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: genParams.toString(),
      signal: AbortSignal.timeout(MEMEGEN_TIMEOUT),
    });
    if (!res.ok) {
      throw Object.assign(new Error("Template meme không hợp lệ"), {
        status: 502,
      });
    }
    const data = await res.json();
    imageUrl = data.url;
  } catch (error) {
    if (error.status) throw error;
    throw Object.assign(new Error("Không thể kết nối nguồn meme"), {
      status: 502,
    });
  }

  if (
    typeof imageUrl !== "string" ||
    !imageUrl.startsWith(`${MEMEGEN_BASE}/images/`)
  ) {
    throw Object.assign(new Error("Nguồn meme trả về URL không hợp lệ"), {
      status: 502,
    });
  }

  const cleanCaption =
    typeof caption === "string" && caption.trim()
      ? caption.trim().slice(0, 280)
      : null;

  const insertResult = await dbPool.query(
    `INSERT INTO moment_memes (moment_id, user_id, image_url, template_id, caption)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [momentId, userId, imageUrl, String(templateId).slice(0, 64), cleanCaption],
  );

  const itemResult = await dbPool.query(
    `SELECT mm.id, mm.moment_id, mm.user_id, mm.image_url, mm.template_id,
            mm.caption, mm.created_at,
            u.name AS user_name, u.image AS user_avatar
     FROM moment_memes mm
     JOIN "user" u ON u.id = mm.user_id
     WHERE mm.id = $1`,
    [insertResult.rows[0].id],
  );
  return toMemeItem(itemResult.rows[0], userId);
}

// Xóa meme của chính mình.
export async function deleteMomentMeme(userId, memeId) {
  const result = await dbPool.query(
    `DELETE FROM moment_memes WHERE id = $1 AND user_id = $2 RETURNING id`,
    [memeId, userId],
  );
  return result.rowCount > 0;
}
