// Admin — tổng quan hệ thống, danh sách người dùng (tìm / lọc / sắp xếp /
// phân trang), chi tiết 1 người dùng, trạng thái AI, xoá người dùng (kèm file).
// Bảng Better Auth dùng cột camelCase ("createdAt", "userId") — giữ nguyên.
import { dbPool } from "../../config/db.js";
import { minioClient, BUCKET_NAME } from "../../config/minio.js";
import { currentModels, getHealth } from "../ai/ai.client.js";

const CHART_DAYS = 30;

/** Số liệu nhanh + 2 biểu đồ 30 ngày + người dùng mới nhất. */
export async function getOverview() {
  const [kpi, signups, uploads, recent] = await Promise.all([
    dbPool.query(
      `SELECT
         (SELECT COUNT(*) FROM "user")::int AS users,
         (SELECT COUNT(*) FROM "user" WHERE "createdAt" >= NOW() - INTERVAL '7 days')::int AS new_users,
         COUNT(*) FILTER (WHERE media_type = 'photo')::int AS photos,
         COUNT(*) FILTER (WHERE media_type = 'video')::int AS videos,
         COALESCE(SUM(file_size_kb), 0)::bigint * 1024 AS storage_bytes,
         (SELECT COUNT(*) FROM developer_requests WHERE status = 'pending')::int AS pending_requests
       FROM media
       WHERE deleted_at IS NULL`,
    ),
    // Đủ 30 ngày (ngày không có ai đăng ký = 0) → biểu đồ không bị hụt ngày.
    dbPool.query(
      `SELECT to_char(d, 'YYYY-MM-DD') AS date, COUNT(u.id)::int AS value
       FROM generate_series(CURRENT_DATE - ($1::int - 1), CURRENT_DATE, INTERVAL '1 day') d
       LEFT JOIN "user" u ON u."createdAt"::date = d::date
       GROUP BY d ORDER BY d`,
      [CHART_DAYS],
    ),
    dbPool.query(
      `SELECT to_char(d, 'YYYY-MM-DD') AS date, COUNT(m.id)::int AS value
       FROM generate_series(CURRENT_DATE - ($1::int - 1), CURRENT_DATE, INTERVAL '1 day') d
       LEFT JOIN media m ON m.created_at::date = d::date
       GROUP BY d ORDER BY d`,
      [CHART_DAYS],
    ),
    dbPool.query(
      `SELECT id, name, email, image, role, "createdAt"
       FROM "user" ORDER BY "createdAt" DESC LIMIT 5`,
    ),
  ]);

  const k = kpi.rows[0];
  return {
    kpi: {
      users: k.users,
      newUsers: k.new_users,
      photos: k.photos,
      videos: k.videos,
      storageBytes: Number(k.storage_bytes),
      pendingRequests: k.pending_requests,
    },
    // 1 mảng theo ngày cho cả 2 đường (recharts đọc chung trục x).
    activity: signups.rows.map((row, i) => ({
      date: row.date,
      signups: row.value,
      uploads: uploads.rows[i]?.value ?? 0,
    })),
    recentUsers: recent.rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      image: u.image ?? null,
      role: u.role ?? "user",
      createdAt: u.createdAt,
    })),
  };
}

// Cột được phép sắp xếp → biểu thức SQL (whitelist, không nối chuỗi từ client).
const USER_SORT = {
  createdAt: `u."createdAt"`,
  name: `LOWER(COALESCE(u.name, u.email))`,
  mediaCount: `media_count`,
  storage: `storage_bytes`,
  lastActive: `last_active_at`,
};

// 1 dòng người dùng kèm số media, dung lượng, lần hoạt động cuối (phiên mới nhất).
const USER_SELECT = `
  SELECT u.id, u.name, u.email, u.image, u.role, u.banned, u."banReason",
         u."emailVerified", u."createdAt",
         COALESCE(m.media_count, 0)::int AS media_count,
         COALESCE(m.storage_bytes, 0)::bigint AS storage_bytes,
         s.last_active_at
  FROM "user" u
  LEFT JOIN (
    SELECT user_id, COUNT(*) AS media_count, SUM(file_size_kb)::bigint * 1024 AS storage_bytes
    FROM media WHERE deleted_at IS NULL GROUP BY user_id
  ) m ON m.user_id = u.id
  LEFT JOIN (
    SELECT "userId", MAX("updatedAt") AS last_active_at FROM session GROUP BY "userId"
  ) s ON s."userId" = u.id`;

const toAdminUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  image: u.image ?? null,
  role: u.role ?? "user",
  banned: Boolean(u.banned),
  banReason: u.banReason ?? null,
  emailVerified: Boolean(u.emailVerified),
  createdAt: u.createdAt,
  mediaCount: u.media_count,
  storageBytes: Number(u.storage_bytes),
  lastActiveAt: u.last_active_at ?? null,
});

/** Bảng người dùng: q (tên / email), role, status, sort, dir, limit, offset. */
export async function listUsers({ q, role, status, sort, dir, limit, offset }) {
  const where = [];
  const params = [];
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };
  if (q) {
    const p = add(`%${q}%`);
    where.push(`(u.name ILIKE ${p} OR u.email ILIKE ${p})`);
  }
  if (role) where.push(`COALESCE(u.role, 'user') = ${add(role)}`);
  if (status === "banned") where.push(`u.banned IS TRUE`);
  if (status === "active") where.push(`u.banned IS NOT TRUE`);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const order = `${USER_SORT[sort] ?? USER_SORT.createdAt} ${dir === "asc" ? "ASC" : "DESC"} NULLS LAST, u.id`;
  const [rows, count] = await Promise.all([
    dbPool.query(
      `${USER_SELECT}
       ${whereSql}
       ORDER BY ${order}
       LIMIT ${add(limit)} OFFSET ${add(offset)}`,
      params,
    ),
    dbPool.query(`SELECT COUNT(*)::int AS total FROM "user" u ${whereSql}`, params.slice(0, -2)),
  ]);

  return {
    total: count.rows[0].total,
    items: rows.rows.map(toAdminUser),
  };
}

// Tiến độ 4 pipeline AI trên ảnh (chưa xoá). `userId` null = toàn hệ thống.
async function aiCoverage(userId, clipModel) {
  const params = [clipModel];
  const userFilter = userId ? `AND m.user_id = $${params.push(userId)}` : "";
  const result = await dbPool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM media_embeddings e
         WHERE e.media_id = m.id AND ($1::text IS NULL OR e.model = $1)))::int AS clip,
       COUNT(m.yolo_processed_at)::int AS yolo,
       COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM media_tags t WHERE t.media_id = m.id))::int AS tags,
       COUNT(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM media_dino_embeddings d WHERE d.media_id = m.id))::int AS dino
     FROM media m
     WHERE m.media_type = 'photo' AND m.deleted_at IS NULL ${userFilter}`,
    params,
  );
  const row = result.rows[0];
  return {
    total: row.total,
    done: { clip: row.clip, yolo: row.yolo, tags: row.tags, dino: row.dino },
  };
}

/** Trạng thái ai-service (online / provider / model) + tiến độ AI toàn hệ thống. */
export async function getSystem() {
  const [health, models] = await Promise.all([getHealth(), currentModels()]);
  return {
    aiService: health
      ? {
          online: true,
          providers: {
            clip: health.embed_provider ?? null,
            yolo: health.object_provider ?? null,
            dino: health.similarity_provider ?? null,
          },
          clipModel: models.clipModel ?? health.clip_model ?? null,
          tagModel: models.tagModel,
        }
      : { online: false, providers: null, clipModel: null, tagModel: null },
    coverage: await aiCoverage(null, models.clipModel),
  };
}

/** Chi tiết 1 người dùng: hồ sơ + số liệu theo loại + tiến độ AI ảnh của họ. */
export async function getUserDetail(userId) {
  const found = await dbPool.query(`${USER_SELECT} WHERE u.id = $1`, [userId]);
  if (found.rowCount === 0) {
    throw Object.assign(new Error("User not found"), { status: 404 });
  }
  const { clipModel } = await currentModels();
  const [stats, coverage] = await Promise.all([
    dbPool.query(
      `SELECT
         COUNT(*) FILTER (WHERE deleted_at IS NULL AND media_type = 'photo')::int AS photos,
         COUNT(*) FILTER (WHERE deleted_at IS NULL AND media_type = 'video')::int AS videos,
         COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS trashed,
         COALESCE(SUM(file_size_kb) FILTER (WHERE deleted_at IS NULL), 0)::bigint * 1024 AS storage_bytes,
         (SELECT COUNT(*) FROM albums WHERE user_id = $1)::int AS albums,
         (SELECT COUNT(*) FROM moments WHERE user_id = $1)::int AS moments
       FROM media WHERE user_id = $1`,
      [userId],
    ),
    aiCoverage(userId, clipModel),
  ]);
  const s = stats.rows[0];
  return {
    user: toAdminUser(found.rows[0]),
    stats: {
      photos: s.photos,
      videos: s.videos,
      trashed: s.trashed,
      storageBytes: Number(s.storage_bytes),
      albums: s.albums,
      moments: s.moments,
    },
    coverage,
  };
}

/**
 * Xoá người dùng: file trên MinIO trước (gốc + mọi bản thu nhỏ), rồi row
 * "user" — các bảng app có FK ON DELETE CASCADE nên DB tự dọn phần còn lại.
 */
export async function deleteUser(userId, currentUserId) {
  if (currentUserId && userId === currentUserId) {
    throw Object.assign(new Error("Cannot delete your own account"), { status: 400 });
  }

  const media = await dbPool.query(
    `SELECT minio_bucket, minio_object, thumbnail_object, thumbnail_small_object,
            display_object, full_object
     FROM media WHERE user_id = $1`,
    [userId],
  );
  const byBucket = new Map();
  for (const row of media.rows) {
    const bucket = row.minio_bucket || BUCKET_NAME;
    if (!byBucket.has(bucket)) byBucket.set(bucket, new Set());
    for (const key of [
      row.minio_object,
      row.thumbnail_object,
      row.thumbnail_small_object,
      row.display_object,
      row.full_object,
    ]) {
      if (key) byBucket.get(bucket).add(key);
    }
  }
  for (const [bucket, keys] of byBucket) {
    try {
      await minioClient.removeObjects(bucket, [...keys]);
    } catch (err) {
      console.error(`Lỗi xoá object MinIO của user ${userId}:`, err.message);
    }
  }

  const result = await dbPool.query(`DELETE FROM "user" WHERE id = $1`, [userId]);
  if (result.rowCount === 0) {
    throw Object.assign(new Error("User not found"), { status: 404 });
  }
  return { success: true, removedObjects: [...byBucket.values()].reduce((n, s) => n + s.size, 0) };
}
