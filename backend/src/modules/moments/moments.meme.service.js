// Meme của moment: nhờ memegen.link render ảnh từ template + dòng chữ, rồi
// TẢI VỀ và lưu vào MinIO (`moments/<momentId>/memes/<memeId>.<ext>`) — P2.2.
// Trình duyệt chỉ tải ảnh từ endpoint có kiểm quyền của backend
// (`GET /api/moments/:momentId/memes/:memeId/image`), không gọi thẳng memegen
// và không lộ object MinIO.
import crypto from "crypto";
import { dbPool } from "../../config/db.js";
import { minioClient, BUCKET_NAME } from "../../config/minio.js";
import { canViewMoment } from "./moments.query.service.js";
import { MAX_MEMES_PER_MOMENT, MEME_FALLBACK_TEMPLATES } from "./moments.constants.js";
import { httpError } from "../../middleware/errorHandler.js";
import { logger } from "../../lib/logger.js";

// ---- Meme templates — memegen.link (không cần auth) ----
const MEMEGEN_BASE = "https://api.memegen.link";
const MEMEGEN_TIMEOUT = 10_000;
const MEME_TEMPLATES_TTL = 6 * 60 * 60 * 1000; // 6h
const MEME_MAX_BYTES = 5 * 1024 * 1024; // 5 MB / ảnh meme
const MEME_PREFIX = "moments/";

// Ký URL ảnh meme (HMAC + hạn dùng) — cùng secret/khung TTL với URL media
// (`media.urls.js`) để ảnh meme cache được mà không cần cookie ở endpoint
// cross-origin (dev: FE 5173 → BE 3000).
const SECRET = process.env.MEDIA_URL_SECRET || process.env.BETTER_AUTH_SECRET;
const TTL_S = Math.max(1, Number(process.env.MEDIA_URL_TTL_HOURS) || 24) * 3600;

function memeSignature(momentId, memeId, exp) {
  return crypto
    .createHmac("sha256", SECRET)
    .update(`${momentId}:${memeId}:${exp}`)
    .digest("base64url")
    .slice(0, 32);
}

function memeImagePath(momentId, memeId) {
  const exp = (Math.floor(Date.now() / 1000 / TTL_S) + 2) * TTL_S;
  const sig = memeSignature(momentId, memeId, exp);
  return `/api/moments/${momentId}/memes/${memeId}/image?exp=${exp}&sig=${sig}`;
}

/** true nếu query `exp`+`sig` của route ảnh meme hợp lệ và còn hạn. */
export function verifyMemeSignature(momentId, memeId, query) {
  const exp = Number(query.exp);
  const sig = typeof query.sig === "string" ? query.sig : "";
  if (!Number.isFinite(exp) || exp < Date.now() / 1000 || sig.length !== 32) {
    return false;
  }
  const given = Buffer.from(sig);
  const expected = Buffer.from(memeSignature(momentId, memeId, exp));
  return (
    given.length === expected.length && crypto.timingSafeEqual(given, expected)
  );
}

export function memeObjectName(momentId, memeId, ext) {
  return `${MEME_PREFIX}${momentId}/memes/${memeId}.${ext}`;
}

const EXT_BY_TYPE = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};
const TYPE_BY_EXT = {
  jpg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

let memeTemplatesCache = { data: null, at: 0 };

// Chuyển 1 row moment_memes (+ user) → object meme trả về cho FE.
function toMemeItem(row, userId) {
  const momentId = String(row.moment_id);
  const memeId = String(row.id);
  return {
    id: memeId,
    momentId,
    userId: row.user_id,
    userName: row.user_name,
    userAvatarUrl: row.user_avatar || null,
    // Meme mới: ảnh nằm trong MinIO → URL backend có chữ ký (không cần cookie).
    // Meme cũ (trước P2.2) chỉ có image_url ngoài → dùng làm fallback.
    imageUrl: row.image_object
      ? memeImagePath(momentId, memeId)
      : row.image_url,
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
    return MEME_FALLBACK_TEMPLATES;
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
    `SELECT mm.id, mm.moment_id, mm.user_id, mm.image_url, mm.image_object,
            mm.template_id, mm.caption, mm.created_at,
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
    throw httpError(404, null, "Không tìm thấy meme");
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

// Báo memegen render meme → trả URL ảnh đã render (validate thuộc memegen).
async function renderMemeUrl(templateId, lines) {
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
      throw httpError(502, null, "Template meme không hợp lệ");
    }
    const data = await res.json();
    imageUrl = data.url;
  } catch (error) {
    if (error.status) throw error;
    throw httpError(502, null, "Không thể kết nối nguồn meme");
  }

  if (
    typeof imageUrl !== "string" ||
    !imageUrl.startsWith(`${MEMEGEN_BASE}/images/`)
  ) {
    throw httpError(502, null, "Nguồn meme trả về URL không hợp lệ");
  }
  return imageUrl;
}

// Tải ảnh meme đã render (chỉ nhận image/*, ≤ 5 MB).
async function fetchMemeImage(imageUrl) {
  let res;
  try {
    res = await fetch(imageUrl, { signal: AbortSignal.timeout(MEMEGEN_TIMEOUT) });
  } catch {
    throw httpError(502, null, "Không tải được ảnh meme");
  }
  if (!res.ok) {
    throw httpError(502, null, "Không tải được ảnh meme");
  }

  const contentType = String(res.headers.get("content-type") || "")
    .toLowerCase()
    .split(";")[0]
    .trim();
  if (!contentType.startsWith("image/")) {
    throw httpError(502, null, "Nguồn meme trả về không phải ảnh");
  }
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared > MEME_MAX_BYTES) {
    throw httpError(502, null, "Ảnh meme quá lớn");
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0 || buffer.length > MEME_MAX_BYTES) {
    throw httpError(502, null, "Ảnh meme quá lớn");
  }
  return { buffer, contentType };
}

// Tạo meme: memegen render → tải ảnh về → lưu MinIO → ghi row.
export async function createMomentMeme(userId, momentId, { templateId, lines, caption }) {
  if (!(await canViewMoment(userId, momentId))) {
    throw httpError(404, null, "Không tìm thấy moment");
  }

  const { rows: countRows } = await dbPool.query(
    "SELECT COUNT(*)::int AS c FROM moment_memes WHERE moment_id = $1",
    [momentId],
  );
  if ((countRows[0]?.c ?? 0) >= MAX_MEMES_PER_MOMENT) {
    throw httpError(409, null, "Đã đạt giới hạn meme cho moment này");
  }

  const externalUrl = await renderMemeUrl(templateId, lines);
  const { buffer, contentType } = await fetchMemeImage(externalUrl);

  const memeId = crypto.randomUUID();
  const ext = EXT_BY_TYPE[contentType] || "jpg";
  const objectName = memeObjectName(momentId, memeId, ext);

  await minioClient.putObject(BUCKET_NAME, objectName, buffer, buffer.length, {
    "Content-Type": TYPE_BY_EXT[ext] || contentType,
    // Ảnh meme không đổi → cache vĩnh viễn ở tầng object.
    "Cache-Control": "public, max-age=31536000, immutable",
  });

  const cleanCaption =
    typeof caption === "string" && caption.trim()
      ? caption.trim().slice(0, 280)
      : null;

  let insertedId;
  try {
    const insertResult = await dbPool.query(
      `INSERT INTO moment_memes
         (id, moment_id, user_id, image_url, image_object, template_id, caption)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        memeId,
        momentId,
        userId,
        // Giữ URL nguồn làm fallback nếu object MinIO bị mất.
        externalUrl,
        objectName,
        String(templateId).slice(0, 64),
        cleanCaption,
      ],
    );
    insertedId = insertResult.rows[0].id;
  } catch (error) {
    await removeMemeObject(objectName).catch(() => {});
    throw error;
  }

  const itemResult = await dbPool.query(
    `SELECT mm.id, mm.moment_id, mm.user_id, mm.image_url, mm.image_object,
            mm.template_id, mm.caption, mm.created_at,
            u.name AS user_name, u.image AS user_avatar
     FROM moment_memes mm
     JOIN "user" u ON u.id = mm.user_id
     WHERE mm.id = $1`,
    [insertedId],
  );
  return toMemeItem(itemResult.rows[0], userId);
}

// Xoá object meme khỏi MinIO (không chặn luồng xoá row nếu lỗi).
export async function removeMemeObject(objectName) {
  if (!objectName) return;
  try {
    await minioClient.removeObject(BUCKET_NAME, objectName);
  } catch (error) {
    logger.warn({ err: error }, `[moments] Không xoá được object meme "${objectName}"`);
  }
}

// Xóa meme của chính mình + object MinIO tương ứng.
// Trả { removed, imageObject } để route/hub biết có gì để dọn.
export async function deleteMomentMeme(userId, memeId, momentId) {
  const result = await dbPool.query(
    `DELETE FROM moment_memes
     WHERE id = $1 AND user_id = $2 AND ($3::uuid IS NULL OR moment_id = $3)
     RETURNING image_object`,
    [memeId, userId, momentId ?? null],
  );
  if (result.rowCount === 0) return { removed: false, imageObject: null };
  const imageObject = result.rows[0].image_object;
  await removeMemeObject(imageObject);
  return { removed: true, imageObject };
}

// Lấy thông tin ảnh meme để stream (null = không có / không phải meme mới).
export async function getMemeImageInfo(momentId, memeId) {
  const result = await dbPool.query(
    `SELECT image_object FROM moment_memes WHERE id = $1 AND moment_id = $2`,
    [memeId, momentId],
  );
  const objectName = result.rows[0]?.image_object;
  if (!objectName) return null;
  return {
    bucket: BUCKET_NAME,
    objectName,
    ext: objectName.split(".").pop()?.toLowerCase() || "jpg",
  };
}

export async function createMemeStream(bucket, objectName) {
  return minioClient.getObject(bucket, objectName);
}

/**
 * Dọn object meme mồ côi: object nằm trong `moments/` mà KHÔNG có row
 * `moment_memes.image_object` trỏ tới (chọn 1 chiều — an toàn hơn xoá row vì
 * lỗi MinIO tạm thời sẽ làm mất meme). Chỉ xét object cũ hơn 1 giờ để không
 * đụng vào ảnh đang được upload.
 * @returns {Promise<number>} số object đã xoá
 */
export async function cleanupOrphanMemeObjects({ olderThanMs = 60 * 60 * 1000 } = {}) {
  const cutoff = Date.now() - olderThanMs;
  const orphans = [];

  const stream = minioClient.listObjectsV2(BUCKET_NAME, MEME_PREFIX, true);
  for await (const obj of stream) {
    if (!obj.name) continue;
    const lastModified = obj.lastModified ? new Date(obj.lastModified).getTime() : 0;
    if (lastModified && lastModified > cutoff) continue;
    orphans.push(obj.name);
  }
  if (orphans.length === 0) return 0;

  let removed = 0;
  for (let i = 0; i < orphans.length; i += 500) {
    const chunk = orphans.slice(i, i + 500);
    const rows = await dbPool.query(
      `SELECT image_object FROM moment_memes WHERE image_object = ANY($1::text[])`,
      [chunk],
    );
    const used = new Set(rows.rows.map((r) => r.image_object));
    const toDelete = chunk.filter((name) => !used.has(name));
    if (toDelete.length === 0) continue;
    await minioClient.removeObjects(BUCKET_NAME, toDelete);
    removed += toDelete.length;
  }
  return removed;
}
