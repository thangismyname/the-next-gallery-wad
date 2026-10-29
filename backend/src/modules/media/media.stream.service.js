import { dbPool } from "../../config/db.js";
import { minioClient, BUCKET_NAME } from "../../config/minio.js";
import {
  ensureDerivatives,
  ensureFullObject,
} from "./media.derivatives.service.js";

export async function getMediaById(id) {
  const result = await dbPool.query(
    `SELECT id, user_id, media_type, minio_object, minio_bucket,
            thumbnail_object, thumbnail_small_object, display_object, full_object,
            mime_type, file_ext, original_filename, updated_at, created_at
     FROM media WHERE id = $1`,
    [id],
  );

  if (result.rows.length === 0) return null;
  return result.rows[0];
}

export async function getThumbnailInfo(id, size) {
  const item = await getMediaById(id);
  if (!item) return null;

  const bucket = item.minio_bucket || BUCKET_NAME;

  // Ảnh + video: CHỈ trả bản resize (tạo ngay nếu thiếu) — không bao giờ
  // stream file gốc vài trăm MB (hay cả file video) ra grid/lightbox.
  // Không tạo được → 404 (file hỏng / định dạng không đọc được).
  // full: chỉ HEIC có (trình duyệt không hiển thị được file gốc).
  let objectToStream = null;
  if (size === "full") {
    objectToStream = await ensureFullObject(item);
  } else if (item.media_type === "photo" || item.media_type === "video") {
    const keys = await ensureDerivatives(item);
    objectToStream =
      size === "display" ? keys.display : size === "small" ? keys.small : keys.med;
  }
  if (!objectToStream) return null;

  const timestamp = new Date(item.updated_at || item.created_at).getTime();
  const etag = `W/"thumb-${size}-${id}-${timestamp}"`;

  return { bucket, objectToStream, etag };
}

export async function getFileInfo(id) {
  const item = await getMediaById(id);
  if (!item) return null;

  const bucket = item.minio_bucket || BUCKET_NAME;
  const objectToStream = item.minio_object;

  if (!objectToStream) return null;

  const timestamp = new Date(item.updated_at || item.created_at).getTime();
  const etag = `W/"file-${id}-${timestamp}"`;

  return {
    bucket,
    objectToStream,
    etag,
    mime: item.mime_type,
    filename: item.original_filename || `${id}${item.file_ext ? `.${item.file_ext}` : ""}`,
  };
}

export async function createMediaStream(bucket, objectName) {
  return minioClient.getObject(bucket, objectName);
}

export async function getObjectSize(bucket, objectName) {
  const stat = await minioClient.statObject(bucket, objectName);
  return stat.size;
}

// Stream 1 đoạn byte [start, end] (bao gồm cả end) — dùng cho Range request.
export async function createMediaRangeStream(bucket, objectName, start, end) {
  return minioClient.getPartialObject(bucket, objectName, start, end - start + 1);
}

// Parse header "Range: bytes=start-end" (chỉ hỗ trợ 1 đoạn).
// Trả { start, end } hợp lệ, null nếu header không áp dụng được (→ trả 200 cả file),
// hoặc false nếu đoạn yêu cầu nằm ngoài file (→ 416).
export function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;

  let start;
  let end;
  if (rawStart === "") {
    // "bytes=-N" → N byte cuối
    const suffix = Number(rawEnd);
    if (suffix === 0) return false;
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    start = Number(rawStart);
    if (rawEnd !== "" && Number(rawEnd) < start) return null; // range sai cú pháp → bỏ qua
    end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }

  if (start >= size) return false;
  return { start, end };
}
