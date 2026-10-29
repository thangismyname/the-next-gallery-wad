import { dbPool } from "../../config/db.js";

/**
 * Số liệu hiển thị trên trang hồ sơ của chính user: ảnh/video (không tính
 * thùng rác), dung lượng, yêu thích, bạn bè (đã chấp nhận), moments đã đăng.
 */
export async function getProfileStats(userId) {
  const result = await dbPool.query(
    `SELECT
       (SELECT COUNT(*) FROM media
         WHERE user_id = $1 AND deleted_at IS NULL AND media_type = 'photo')::int AS photos,
       (SELECT COUNT(*) FROM media
         WHERE user_id = $1 AND deleted_at IS NULL AND media_type = 'video')::int AS videos,
       (SELECT COUNT(*) FROM media
         WHERE user_id = $1 AND deleted_at IS NULL AND is_favorite)::int AS favorites,
       (SELECT COALESCE(SUM(file_size_kb), 0) FROM media
         WHERE user_id = $1 AND deleted_at IS NULL)::bigint AS storage_kb,
       (SELECT COUNT(*) FROM friendships
         WHERE (requester_id = $1 OR addressee_id = $1)
           AND status = 'accepted')::int AS friends,
       (SELECT COUNT(*) FROM moments WHERE user_id = $1)::int AS moments`,
    [userId],
  );
  const row = result.rows[0];
  return {
    photos: row.photos,
    videos: row.videos,
    favorites: row.favorites,
    storageBytes: Number(row.storage_kb) * 1024,
    friends: row.friends,
    moments: row.moments,
  };
}

/**
 * Dung lượng chia theo loại cho trang cài đặt: ảnh / video đang dùng và phần
 * nằm trong thùng rác (vẫn chiếm chỗ trên MinIO cho tới khi xoá vĩnh viễn).
 */
export async function getStorageBreakdown(userId) {
  const result = await dbPool.query(
    `SELECT
       COALESCE(SUM(file_size_kb) FILTER (
         WHERE deleted_at IS NULL AND media_type = 'photo'), 0)::bigint AS photo_kb,
       COALESCE(SUM(file_size_kb) FILTER (
         WHERE deleted_at IS NULL AND media_type = 'video'), 0)::bigint AS video_kb,
       COALESCE(SUM(file_size_kb) FILTER (WHERE deleted_at IS NOT NULL), 0)::bigint AS trash_kb,
       COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS trash_count
     FROM media
     WHERE user_id = $1`,
    [userId],
  );
  const row = result.rows[0];
  return {
    photoBytes: Number(row.photo_kb) * 1024,
    videoBytes: Number(row.video_kb) * 1024,
    trashBytes: Number(row.trash_kb) * 1024,
    trashCount: row.trash_count,
  };
}

/**
 * Ảnh đại diện chọn từ thư viện: user.image = URL ổn định
 * /api/profile/avatar/:mediaId (không phải URL ký — URL ký hết hạn sau 1–2
 * ngày). Chỉ phục vụ khi ảnh đó ĐANG là avatar của chính chủ ảnh.
 */
export async function isCurrentAvatar(mediaId) {
  const result = await dbPool.query(
    `SELECT 1
     FROM media m
     JOIN "user" u ON u.id = m.user_id
     WHERE m.id = $1
       AND m.deleted_at IS NULL
       AND u.image LIKE '%/api/profile/avatar/' || m.id::text`,
    [mediaId],
  );
  return result.rowCount > 0;
}
