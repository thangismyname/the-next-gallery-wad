// Album tự động — KHÔNG lưu trong DB, tính lại mỗi lần mở (như album thông
// minh) từ dữ liệu sẵn có, nên ảnh mới upload tự vào đúng album:
//   type     Ảnh · Video · Ảnh chụp màn hình · Yêu thích  (mọi media ∈ Ảnh/Video)
//   content  tag nội dung tin cậy (media_tags ≥ ngưỡng); ảnh không tag nào → "other"
//   time     theo tháng (mọi media) + sự kiện (ảnh có ngày chụp EXIF sát nhau)
//   objects  nhóm vật thể COCO từ YOLO (media_detections ≥ AI_YOLO_MIN_CONF)
// Mỗi nhóm = 1 câu SQL "thành viên" trả (id, key, ts); danh sách album và ảnh
// của 1 album đều đọc từ cùng câu đó → không bao giờ lệch nhau.
import { dbPool } from "../../config/db.js";
import { mediaThumbUrl } from "../media/media.mapper.js";
import { getMediaItemsByIds } from "../media/media.list.service.js";
import { httpError } from "./albums.access.js";
import { getAlbum } from "./albums.service.js";
import {
  AUTO_EVENT_GAP_HOURS,
  AUTO_EVENT_MIN_ITEMS,
  AUTO_GROUPS,
  AUTO_TYPE_ORDER,
  COCO_SUPERCATEGORY,
} from "./albums.constants.js";

const OBJECT_MIN_CONF = Number.isFinite(Number(process.env.AI_YOLO_MIN_CONF))
  ? Number(process.env.AI_YOLO_MIN_CONF)
  : 0.4;

// Tên file ảnh chụp màn hình phổ biến (iOS, Android, macOS, Windows, vi/ja).
const SCREENSHOT_RE =
  "(screen ?shot|screenshot|ảnh chụp màn hình|スクリーンショット|^scr_|^capture)";

const OBJECT_CLASSES = Object.keys(COCO_SUPERCATEGORY);
const OBJECT_GROUPS = OBJECT_CLASSES.map((c) => COCO_SUPERCATEGORY[c]);

// $1 = user. Tham số riêng của từng nhóm đánh số từ $2 (Postgres báo lỗi nếu
// truyền tham số mà câu SQL không dùng → mỗi nhóm chỉ nhận đúng phần của mình).
const BASE = `
  SELECT id, media_type, is_favorite, original_filename, taken_at,
         COALESCE(taken_at, created_at) AS ts
  FROM media
  WHERE user_id = $1 AND deleted_at IS NULL`;

/** Câu SQL thành viên của 1 nhóm → rows (id, key, ts). `zone` = múi giờ IANA. */
const MEMBERS = {
  type: () => ({
    sql: `
      SELECT m.id, v.key, m.ts
      FROM (${BASE}) m
      CROSS JOIN LATERAL (VALUES
        (CASE WHEN m.media_type = 'photo' THEN 'type-photos' END),
        (CASE WHEN m.media_type = 'video' THEN 'type-videos' END),
        (CASE WHEN m.media_type = 'photo'
               AND m.original_filename ~* '${SCREENSHOT_RE}' THEN 'type-screenshots' END),
        (CASE WHEN m.is_favorite THEN 'type-favorites' END)
      ) v(key)
      WHERE v.key IS NOT NULL`,
    params: [],
  }),

  // Ảnh có thể thuộc nhiều tag; ảnh chưa phân loại / không đạt ngưỡng tag nào → other.
  content: () => ({
    sql: `
      WITH m AS (${BASE} AND media_type = 'photo'),
      t AS (
        SELECT t.media_id, t.tag FROM media_tags t
        WHERE t.user_id = $1 AND t.confidence >= t.threshold
      )
      SELECT m.id, 'tag-' || t.tag AS key, m.ts FROM m JOIN t ON t.media_id = m.id
      UNION ALL
      SELECT m.id, 'tag-other', m.ts FROM m
      WHERE NOT EXISTS (SELECT 1 FROM t WHERE t.media_id = m.id)`,
    params: [],
  }),

  // Tháng: mọi media. Sự kiện: ảnh có NGÀY CHỤP thật (EXIF), chuỗi ảnh cách
  // nhau ≤ AUTO_EVENT_GAP_HOURS, đủ AUTO_EVENT_MIN_ITEMS ảnh. Key sự kiện =
  // thời điểm ảnh đầu tiên (giờ địa phương).
  time: (zone) => ({
    sql: `
      WITH m AS (${BASE}),
      g AS (
        SELECT id, taken_at,
               CASE WHEN taken_at - LAG(taken_at) OVER (ORDER BY taken_at)
                         <= make_interval(hours => $3) THEN 0 ELSE 1 END AS brk
        FROM m WHERE taken_at IS NOT NULL
      ),
      c AS (
        SELECT id, taken_at,
               SUM(brk) OVER (ORDER BY taken_at ROWS UNBOUNDED PRECEDING) AS grp
        FROM g
      ),
      e AS (
        SELECT id, taken_at,
               MIN(taken_at) OVER (PARTITION BY grp) AS start_at,
               COUNT(*) OVER (PARTITION BY grp) AS n
        FROM c
      )
      SELECT id, 'month-' || to_char(ts AT TIME ZONE $2, 'YYYY-MM') AS key, ts FROM m
      UNION ALL
      SELECT id, 'event-' || to_char(start_at AT TIME ZONE $2, 'YYYYMMDDHH24MI') AS key,
             taken_at AS ts
      FROM e WHERE n >= $4`,
    params: [zone, AUTO_EVENT_GAP_HOURS, AUTO_EVENT_MIN_ITEMS],
  }),

  // 1 ảnh có nhiều vật thể cùng nhóm (2 con chó) → chỉ tính 1 lần.
  objects: () => ({
    sql: `
      SELECT DISTINCT m.id, 'object-' || cat.grp AS key, m.ts
      FROM (${BASE}) m
      JOIN media_detections d ON d.media_id = m.id AND d.confidence >= $2
      JOIN unnest($3::text[], $4::text[]) AS cat(cls, grp) ON cat.cls = d.class_name`,
    params: [OBJECT_MIN_CONF, OBJECT_CLASSES, OBJECT_GROUPS],
  }),
};

// Múi giờ client (IANA) — chỉ nhận tên Postgres biết, sai → UTC.
const tzCache = new Map();
async function resolveTimeZone(tz) {
  if (!tz) return "UTC";
  if (!tzCache.has(tz)) {
    const ok = await dbPool.query(`SELECT 1 FROM pg_timezone_names WHERE name = $1`, [tz]);
    tzCache.set(tz, ok.rowCount > 0);
  }
  return tzCache.get(tz) ? tz : "UTC";
}

function groupOfKey(key) {
  const prefix = key.split("-")[0];
  return { type: "type", tag: "content", month: "time", event: "time", object: "objects" }[
    prefix
  ];
}

// Thứ tự album trong nhóm: loại media cố định; thời gian mới nhất trước
// (sự kiện trước tháng); còn lại nhiều ảnh trước, "other" cuối.
function sortAlbums(group, albums) {
  const rank = (a) => {
    if (group === "type") return AUTO_TYPE_ORDER.indexOf(a.key);
    if (a.key === "tag-other") return Infinity;
    return -a.count;
  };
  if (group === "time") {
    return albums.sort((a, b) => {
      const kind = (a.key.startsWith("event") ? 0 : 1) - (b.key.startsWith("event") ? 0 : 1);
      return kind || new Date(b.lastAt) - new Date(a.lastAt);
    });
  }
  return albums.sort((a, b) => rank(a) - rank(b));
}

/** Mọi album tự động, theo nhóm: { groups: [{ id, albums: [...] }] }. */
export async function listAutoAlbums(userId, { tz } = {}) {
  const zone = await resolveTimeZone(tz);
  const groups = await Promise.all(
    AUTO_GROUPS.map(async (group) => {
      const { sql, params } = MEMBERS[group](zone);
      const result = await dbPool.query(
        `SELECT key, COUNT(*)::int AS count,
                (array_agg(id ORDER BY ts DESC))[1] AS cover_id,
                MIN(ts) AS first_at, MAX(ts) AS last_at
         FROM (${sql}) x
         GROUP BY key`,
        [userId, ...params],
      );
      const albums = result.rows.map((row) => ({
        key: row.key,
        group,
        count: row.count,
        coverUrl: mediaThumbUrl(String(row.cover_id), "med"),
        firstAt: row.first_at,
        lastAt: row.last_at,
      }));
      return { id: group, albums: sortAlbums(group, albums) };
    }),
  );
  return { groups };
}

/** Id ảnh của 1 album tự động, mới nhất trước. Không có ảnh → 404. */
async function resolveAutoIds(userId, key, zone) {
  const group = groupOfKey(key);
  if (!group) throw httpError(404, "Không tìm thấy album", "ALBUM_NOT_FOUND");
  const { sql, params } = MEMBERS[group](zone);
  const result = await dbPool.query(
    `SELECT id FROM (${sql}) x WHERE key = $${params.length + 2} ORDER BY ts DESC`,
    [userId, ...params, key],
  );
  if (result.rowCount === 0) throw httpError(404, "Không tìm thấy album", "ALBUM_NOT_FOUND");
  return result.rows.map((r) => String(r.id));
}

export async function listAutoAlbumMedia(userId, key, { limit, offset, tz }) {
  const ids = await resolveAutoIds(userId, key, await resolveTimeZone(tz));
  const items = await getMediaItemsByIds(userId, ids.slice(offset, offset + limit));
  return { total: ids.length, items };
}

/**
 * Chốt album tự động thành album thường (tên do client đặt — đã dịch), giữ
 * thứ tự mới nhất trước bằng `position`.
 */
export async function saveAutoAlbum(userId, key, { name, tz }) {
  const ids = await resolveAutoIds(userId, key, await resolveTimeZone(tz));
  const client = await dbPool.connect();
  let albumId;
  try {
    await client.query("BEGIN");
    const created = await client.query(
      `INSERT INTO albums (user_id, name, kind) VALUES ($1, $2, 'manual') RETURNING id`,
      [userId, name],
    );
    albumId = String(created.rows[0].id);
    await client.query(
      `INSERT INTO album_media (album_id, media_id, added_by, position)
       SELECT $1, x.id, $2, x.pos
       FROM unnest($3::uuid[]) WITH ORDINALITY AS x(id, pos)`,
      [albumId, userId, ids],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return getAlbum(userId, albumId);
}
