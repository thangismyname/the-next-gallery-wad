import { createHash, randomUUID } from "crypto";
import { createReadStream } from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { dbPool } from "../../config/db.js";
import { minioClient, BUCKET_NAME } from "../../config/minio.js";
import { enqueueMediaAi } from "../ai/ai.queue.js";
import { recordImportMedia } from "../imports/imports.service.js";
import { toMediaItem } from "./media.mapper.js";
import {
  buildImageDerivatives,
  buildVideoDerivatives,
  putDerivative,
} from "./media.derivatives.service.js";
import { classifyUpload, readPhotoTakenAt } from "./media.sources.js";
import { logger } from "../../lib/logger.js";
import { httpError } from "../../middleware/errorHandler.js";

const ITEM_COLUMNS = `id, media_type, mime_type,
                  COALESCE(original_filename, CONCAT('Media ', id::text)) AS title,
                  width, height, duration_seconds, file_size_kb,
                  thumbnail_object, thumbnail_small_object, created_at, deleted_at, taken_at, is_favorite,
                  caption, latitude, longitude, motion_object IS NOT NULL AS has_motion`;

/** SHA-256 (hex) của file tạm — đọc stream, không giữ cả file trong RAM. */
export async function hashFile(filePath) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

/**
 * Ảnh cùng hash của user (ưu tiên bản đang hiện) → áp meta của lần upload này lên nó và trả về,
 * null = chưa có. Meta chỉ THÊM: tim (không bỏ tim), album, ngày chụp khi đang trống. Ảnh đang ở
 * Thùng rác: upload thường khôi phục nó (người dùng tải lại = muốn thấy ảnh); import (`bulk`)
 * giữ nguyên trong thùng rác (chạy lại Takeout không được làm sống lại ảnh đã dọn).
 * shortcut: 2 request cùng lúc cùng 1 file vẫn có thể tạo 2 bản (không UNIQUE) — thêm khoá nếu cần.
 */
async function reuseDuplicate(userId, sha256, fileMeta) {
  const { rows } = await dbPool.query(
    `UPDATE media SET
       is_favorite = is_favorite OR $3,
       taken_at = COALESCE(taken_at, $4::timestamptz),
       deleted_at = CASE WHEN $5 THEN NULL ELSE deleted_at END,
       caption = COALESCE(caption, $6),
       latitude = CASE WHEN latitude IS NULL THEN $7 ELSE latitude END,
       longitude = CASE WHEN latitude IS NULL THEN $8 ELSE longitude END,
       updated_at = NOW()
     WHERE id = (
       SELECT id FROM media WHERE user_id = $1 AND content_sha256 = $2
       ORDER BY deleted_at IS NOT NULL, created_at LIMIT 1
     )
     RETURNING ${ITEM_COLUMNS}`,
    [
      userId,
      sha256,
      fileMeta.favorite === true,
      fileMeta.takenAt ?? null,
      fileMeta.bulk !== true,
      fileMeta.description ?? null,
      fileMeta.location?.lat ?? null,
      fileMeta.location?.lng ?? null,
    ],
  );
  const row = rows[0];
  if (!row) return null;
  await addToAlbums(userId, row.id, fileMeta.albumIds);
  return row;
}

/** Importer: thêm vào album (chỉ album thường của chính mình — id lạ / smart bị bỏ qua). */
async function addToAlbums(userId, mediaId, albumIds) {
  if (!albumIds?.length) return;
  await dbPool.query(
    `INSERT INTO album_media (album_id, media_id, added_by)
     SELECT a.id, $1, $2 FROM albums a
     WHERE a.id = ANY($3::uuid[]) AND a.user_id = $2 AND a.kind = 'manual'
     ON CONFLICT (album_id, media_id) DO NOTHING`,
    [mediaId, userId, albumIds],
  );
}

/**
 * Video Live Photo → object MinIO gắn vào `photo` (kết quả upload của ảnh cùng request). Ảnh đã có
 * video (ảnh trùng đã nhập trước đó) → bỏ bản mới. 400 nếu không phải video / không có ảnh đi kèm.
 */
async function attachMotion(userId, file, photo) {
  const { mediaType, mimeType } = classifyUpload(file);
  if (mediaType !== "video" || !photo || photo.mediaType !== "photo") {
    throw httpError(400, "INVALID_LIVE_PHOTO", `Live Photo không hợp lệ: ${file.originalname}`);
  }
  const objectName = `${userId}/${randomUUID()}${path.extname(file.originalname) || ".mov"}`;
  await minioClient.fPutObject(BUCKET_NAME, objectName, file.path, { "Content-Type": mimeType });
  const { rows } = await dbPool.query(
    `UPDATE media SET motion_object = $3, updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND motion_object IS NULL RETURNING id`,
    [photo.id, userId, objectName],
  );
  if (!rows.length) await minioClient.removeObject(BUCKET_NAME, objectName).catch(() => {});
  return { motionOf: photo.id, duplicate: Boolean(photo.duplicate) || !rows.length };
}

// `files` từ multer diskStorage — mỗi file có `path` (file tạm), không có buffer.
// Route tự xoá file tạm sau khi xong. `meta[i]` (tuỳ chọn, từ importer) đi với `files[i]`:
// `takenAt` chỉ dùng khi file không có EXIF / creation_time, `favorite` = thả tim luôn, `albumIds` = album sẽ chứa ảnh.
export async function uploadMedia(userId, files, meta = []) {
  const uploaded = [];

  for (const [index, file] of files.entries()) {
    const fileMeta = meta[index] ?? {};

    // Live Photo: video này gắn vào ảnh đứng trước trong cùng request, không thành 1 media riêng.
    if (fileMeta.livePhotoOf !== undefined) {
      uploaded.push(await attachMotion(userId, file, uploaded[fileMeta.livePhotoOf]));
      continue;
    }

    // Trùng nội dung với ảnh đã có → không lưu bản mới, trả ảnh cũ (`duplicate: true`).
    const sha256 = await hashFile(file.path);
    const existing = await reuseDuplicate(userId, sha256, fileMeta);
    if (existing) {
      await recordImportMedia(userId, fileMeta.importId, existing.id, true);
      uploaded.push({ ...toMediaItem(existing), duplicate: true });
      continue;
    }

    const ext = path.extname(file.originalname) || "";
    const objectName = `${userId}/${randomUUID()}${ext}`;
    // Route đã lọc bằng classifyUpload — HEIC/MOV gửi kèm MIME rỗng/octet-stream
    // được nhận theo đuôi file và lưu với MIME chuẩn.
    const { mediaType, mimeType } = classifyUpload(file);

    // fPutObject stream từ đĩa (multipart) — không đọc cả file vào RAM.
    await minioClient.fPutObject(BUCKET_NAME, objectName, file.path, {
      "Content-Type": mimeType,
    });

    let thumbnailObject = null;
    let thumbnailSmallObject = null;
    let displayObject = null;
    let width = null;
    let height = null;
    let durationSeconds = null;
    // Ngày chụp (EXIF / metadata video) — thư viện nhóm & sắp theo ngày này.
    // Ảnh đọc EXIF ngay (không phụ thuộc việc tạo thumbnail thành công).
    let takenAt = mediaType === "photo" ? await readPhotoTakenAt(file.path) : null;
    // Ảnh đưa cho AI: bản display (≤2048px, GIỮ tỉ lệ) — không phải bản cắt
    // vuông, để YOLO thấy cả khung ảnh và bbox khớp ảnh thật.
    let aiBuffer = null;

    try {
      // Video: poster cắt bằng ffmpeg; ảnh (kể cả HEIC): decode trực tiếp.
      const d =
        mediaType === "video"
          ? await buildVideoDerivatives(file.path)
          : await buildImageDerivatives(file.path);
      width = d.width;
      height = d.height;
      durationSeconds = d.durationSeconds ?? null;
      if (mediaType === "video") takenAt = d.takenAt ?? null;
      if (mediaType === "photo") aiBuffer = d.display;
      [displayObject, thumbnailObject, thumbnailSmallObject] =
        await Promise.all([
          putDerivative(userId, d.display),
          putDerivative(userId, d.med),
          putDerivative(userId, d.small),
        ]);
    } catch (thumbErr) {
      // Không chặn upload — endpoint thumbnail sẽ thử tạo lại khi được gọi.
      logger.error({ err: thumbErr }, "Lỗi tạo thumbnail");
    }

    // DB bắt buộc video có duration (chk_video_duration). ffmpeg không đọc nổi
    // thời lượng = file hỏng/không phải video → gỡ object vừa đẩy lên, báo 400.
    if (mediaType === "video" && durationSeconds == null) {
      const orphans = [objectName, displayObject, thumbnailObject, thumbnailSmallObject];
      await minioClient
        .removeObjects(BUCKET_NAME, orphans.filter(Boolean))
        .catch(() => {});
      const err = new Error(`Không đọc được video: ${file.originalname}`);
      err.status = 400;
      err.code = "INVALID_VIDEO";
      throw err;
    }

    // Ngày trong file luôn thắng; ngày importer gửi (vd JSON của Google Takeout) chỉ lấp chỗ trống.
    takenAt = takenAt ?? (fileMeta.takenAt ? new Date(fileMeta.takenAt) : null);

    const result = await dbPool.query(
      `INSERT INTO media
        (user_id, media_type, original_filename, minio_object, minio_bucket,
         thumbnail_object, thumbnail_small_object, display_object, width, height,
         duration_seconds, file_ext, mime_type, file_size_kb, taken_at, is_favorite, content_sha256,
         caption, latitude, longitude, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW(), NOW())
RETURNING ${ITEM_COLUMNS}`,
      [
        userId,
        mediaType,
        file.originalname,
        objectName,
        BUCKET_NAME,
        thumbnailObject,
        thumbnailSmallObject,
        displayObject,
        width,
        height,
        durationSeconds,
        ext.replace(".", "").toLowerCase(),
        mimeType,
        Math.round(file.size / 1024),
        takenAt,
        fileMeta.favorite === true,
        sha256,
        fileMeta.description ?? null,
        fileMeta.location?.lat ?? null,
        fileMeta.location?.lng ?? null,
      ],
    );

    const mediaRow = result.rows[0];

    await addToAlbums(userId, mediaRow.id, fileMeta.albumIds);
    await recordImportMedia(userId, fileMeta.importId, mediaRow.id, false);

    // AI (CLIP + tag, YOLO, DINOv3) qua hàng đợi giới hạn — không chặn response, lỗi chỉ log.
    // Import (`meta.bulk`) đi làn chậm để upload thường của mọi người không phải chờ.
    // Không tạo được bản display (ảnh lỗi/định dạng lạ) → bỏ qua, backfill sẽ thử lại từ file gốc.
    if (aiBuffer) {
      enqueueMediaAi({ mediaId: String(mediaRow.id), userId, buffer: aiBuffer, bulk: fileMeta.bulk === true });
    }

    uploaded.push(toMediaItem(mediaRow));
  }

  return uploaded;
}
