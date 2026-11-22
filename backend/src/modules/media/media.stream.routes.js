import express, { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { downloadLimit } from "../../middleware/rateLimit.js";
import { attachmentHeader, streamMediaZip } from "./media.download.service.js";
import { zipDownloadSchema } from "./media.schema.js";
import { streamLibraryExport } from "./media.export.service.js";
import { authorizeMediaRequest } from "./media.access.js";
import {
  getThumbnailInfo,
  getFileInfo,
  createMediaStream,
  createMediaRangeStream,
  getObjectSize,
  parseRange,
} from "./media.stream.service.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { logger } from "../../lib/logger.js";

/** Stream ảnh / video (URL có chữ ký, ETag, Range) + tải zip bản gốc. Gắn vào media.routes.js. */
const router = Router();

// Ảnh / video chỉ tải được bằng URL có chữ ký (backend trả sẵn trong mọi
// API) hoặc khi là chủ ảnh đang đăng nhập — xem media.access.js.
const FORBIDDEN = {
  success: false,
  error: { code: "MEDIA_FORBIDDEN", message: "Link ảnh không hợp lệ hoặc đã hết hạn" },
};

router.get("/:id/thumbnail", asyncHandler(async (req, res) => {
  const size = ["small", "display", "full", "base"].includes(req.query.size)
    ? req.query.size
    : "med";
  // Kiểm tra quyền TRƯỚC khi tạo thumbnail (tạo bản resize tốn CPU).
  const access = await authorizeMediaRequest(req, req.params.id, size);
  if (!access) return res.status(403).json(FORBIDDEN);
  const info = await getThumbnailInfo(req.params.id, size);

  if (!info) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Media not found" },
    });
  }

  if (req.headers["if-none-match"] === info.etag) {
    return res.status(304).end();
  }

  // Mọi bản resize (ảnh, poster video, full HEIC) đều là WebP.
  res.setHeader("Content-Type", "image/webp");
  res.setHeader("Cache-Control", access.cacheControl);
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("ETag", info.etag);

  const stream = await createMediaStream(info.bucket, info.objectToStream);
  stream.on("error", (err) => {
    logger.error({ err }, `Lỗi stream thumbnail ${info.objectToStream}`);
    if (!res.headersSent) res.status(500).json({ success: false, error: { code: "STREAM_ERROR", message: "Stream error" } });
  });
  stream.pipe(res);
}));

// Bản gốc (`/file`) và video Live Photo (`/motion`) — cùng quyền (URL ký) + Range.
const streamFile = (kind) => asyncHandler(async (req, res) => {
  const access = await authorizeMediaRequest(req, req.params.id, kind);
  if (!access) return res.status(403).json(FORBIDDEN);
  const info = await getFileInfo(req.params.id, kind);

  if (!info) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Media not found" },
    });
  }

  if (req.headers["if-none-match"] === info.etag) {
    return res.status(304).end();
  }

  const size = await getObjectSize(info.bucket, info.objectToStream);

  res.setHeader("Content-Type", info.mime || "application/octet-stream");
  // Object gốc không bao giờ đổi (ETag gắn updated_at) → cache tới khi URL
  // ký hết hạn, trình duyệt không tải lại file nặng lần 2.
  res.setHeader("Cache-Control", access.cacheControl);
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("ETag", info.etag);
  res.setHeader("Accept-Ranges", "bytes");
  // ?download=1 → tải về với tên file gốc (không nằm trong chữ ký URL).
  if (kind === "file" && req.query.download === "1") {
    res.setHeader("Content-Disposition", attachmentHeader(info.filename));
  }

  // Range request (video seek / Safari) → 206 Partial Content.
  // Bỏ qua Range nếu If-Range không khớp ETag hiện tại → trả cả file.
  const ifRange = req.headers["if-range"];
  const range =
    req.headers.range && (!ifRange || ifRange === info.etag)
      ? parseRange(req.headers.range, size)
      : null;

  if (range === false) {
    res.setHeader("Content-Range", `bytes */${size}`);
    return res.status(416).end();
  }

  let stream;
  if (range) {
    res.status(206);
    res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
    res.setHeader("Content-Length", range.end - range.start + 1);
    stream = await createMediaRangeStream(
      info.bucket,
      info.objectToStream,
      range.start,
      range.end,
    );
  } else {
    res.setHeader("Content-Length", size);
    stream = await createMediaStream(info.bucket, info.objectToStream);
  }
  stream.on("error", (err) => {
    logger.error({ err }, `Lỗi stream file ${info.objectToStream}`);
    if (!res.headersSent) res.status(500).json({ success: false, error: { code: "STREAM_ERROR", message: "Stream error" } });
    else res.destroy(err);
  });
  // Client huỷ request (tua video liên tục) → đóng luôn stream MinIO.
  res.on("close", () => stream.destroy());
  stream.pipe(res);
});

router.get("/:id/file", streamFile("file"));
router.get("/:id/motion", streamFile("motion"));

// Tải nhiều bản gốc thành 1 file zip. Gửi bằng <form method=POST> (trình
// duyệt tự lưu file đang stream, không qua RAM của tab): body `ids=a,b,c`.
router.post(
  "/download/zip",
  requireAuth,
  downloadLimit,
  express.urlencoded({ extended: false, limit: "64kb" }),
  validate(zipDownloadSchema),
  async (req, res, next) => {
    try {
      await streamMediaZip(req.user.id, req.body.ids, res);
    } catch (error) {
      if (res.headersSent) res.destroy(error);
      else next(error);
    }
  },
);

// Xuất cả thư viện (định dạng Google Takeout) để chuyển nền tảng — mở bằng link thường (cookie).
router.get("/export", requireAuth, downloadLimit, async (req, res, next) => {
  try {
    await streamLibraryExport(req.user.id, res);
  } catch (error) {
    if (res.headersSent) res.destroy(error);
    else next(error);
  }
});

export default router;
