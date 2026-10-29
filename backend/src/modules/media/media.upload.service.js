import { randomUUID } from "crypto";
import path from "path";
import { dbPool } from "../../config/db.js";
import { minioClient, BUCKET_NAME } from "../../config/minio.js";
import { embedMediaInBackground } from "../ai/embedding.service.js";
import { detectMediaInBackground } from "../ai/detection.service.js";
import { embedDinoInBackground } from "../ai/similarity.service.js";
import { toMediaItem } from "./media.mapper.js";
import {
  buildImageDerivatives,
  buildVideoDerivatives,
  putDerivative,
} from "./media.derivatives.service.js";
import { classifyUpload, readPhotoTakenAt } from "./media.sources.js";

// `files` từ multer diskStorage — mỗi file có `path` (file tạm), không có buffer.
// Route tự xoá file tạm sau khi xong.
export async function uploadMedia(userId, files) {
  const uploaded = [];

  for (const file of files) {
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
      console.error("Lỗi tạo thumbnail:", thumbErr.message);
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

    const result = await dbPool.query(
      `INSERT INTO media
        (user_id, media_type, original_filename, minio_object, minio_bucket,
         thumbnail_object, thumbnail_small_object, display_object, width, height,
         duration_seconds, file_ext, mime_type, file_size_kb, taken_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
RETURNING id, media_type, mime_type,
                  COALESCE(original_filename, CONCAT('Media ', id::text)) AS title,
                  width, height, duration_seconds, file_size_kb,
                  thumbnail_object, thumbnail_small_object, created_at, deleted_at, taken_at`,
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
      ],
    );

    const mediaRow = result.rows[0];

    // Semantic search: tạo embedding CLIP chạy NỀN — không chặn response upload.
    // Lỗi AI service sẽ chỉ log, upload vẫn thành công. Không tạo được bản
    // display (ảnh lỗi/định dạng lạ) → bỏ qua, backfill sẽ thử lại từ file gốc.
    if (aiBuffer) {
      embedMediaInBackground({
        mediaId: String(mediaRow.id),
        userId,
        buffer: aiBuffer,
      });
      // Object detection (YOLO26) cũng chạy nền song song.
      detectMediaInBackground({
        mediaId: String(mediaRow.id),
        userId,
        buffer: aiBuffer,
      });
      // Ảnh tương tự (DINOv3) — descriptor ảnh↔ảnh, cũng chạy nền.
      embedDinoInBackground({
        mediaId: String(mediaRow.id),
        userId,
        buffer: aiBuffer,
      });
    }

    uploaded.push(toMediaItem(mediaRow));
  }

  return uploaded;
}
