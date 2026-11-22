import fs from "fs/promises";
import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { uploadChunkLimit, uploadLimit } from "../../middleware/rateLimit.js";
import { httpError } from "../../middleware/errorHandler.js";
import {
  listMediaQuerySchema,
  listAlbumsQuerySchema,
  listFavoritesQuerySchema,
  listTrashQuerySchema,
  mediaIdsSchema,
  favoriteSchema,
  lookupMediaSchema,
  parseUploadMeta,
  startChunkedSchema,
  chunkParamsSchema,
  chunkQuerySchema,
  completeChunkedSchema,
} from "./media.schema.js";
import {
  listMedia,
  listFavorites,
  listAlbumCovers,
  setFavorite,
  getMediaItemsByIds,
} from "./media.list.service.js";
import { uploadMedia } from "./media.upload.service.js";
import { appendChunk, completeChunkedUpload, MAX_CHUNK_BYTES, startChunkedUpload } from "./media.chunked.service.js";
import { classifyUpload } from "./media.sources.js";
import {
  softDeleteMedia,
  listTrash,
  restoreMedia,
  permanentDeleteMedia,
  emptyTrash,
} from "./media.trash.service.js";
import streamRoutes from "./media.stream.routes.js";
import aiRoutes from "./media.ai.routes.js";
import editRoutes from "./media.edit.routes.js";
import { asyncHandler, respond } from "../../middleware/asyncHandler.js";

/*
 * /api/gallery/media — chia 3 file, cùng 1 tiền tố:
 *   media.routes.js         danh sách · yêu thích · lookup · thùng rác · upload
 *   media.stream.routes.js  /:id/thumbnail · /:id/file (Range) · /download/zip
 *   media.ai.routes.js      Spotlight search · embed / detection / similar / tags (status, backfill, theo ảnh)
 *   media.edit.routes.js    /:id/edit — basic edit không phá huỷ (công thức + bản resize đã chỉnh)
 * Không route nào trùng nhau giữa 3 router (path tĩnh 1 đoạn ở đây, /:id/<x> 2 đoạn, AI có tiền tố riêng).
 */
const router = Router();

// File lưu tạm ra đĩa (không giữ trong RAM) — ảnh/video có thể vài trăm MB.
// uploadMedia stream từ đĩa lên MinIO; route xoá file tạm khi xong.
const upload = multer({
  storage: multer.diskStorage({}),
  defParamCharset: "utf8", // mặc định latin1 → tên file có dấu bị lỗi font ("BaÌ\u0089n sao")
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // Theo MIME, fallback theo đuôi (HEIC/MOV từ Windows/Android hay thiếu MIME).
    if (!classifyUpload(file).mediaType) {
      return cb(httpError(400, "UNSUPPORTED_MEDIA", "Chỉ chấp nhận file ảnh hoặc video"));
    }
    cb(null, true);
  },
});

router.get(
  "/",
  requireAuth,
  validate(listMediaQuerySchema, "query"),
  respond((req) => listMedia(req.user.id, { limit: req.query.limit, offset: req.query.offset, sort: req.query.sort, type: req.query.type })),
);

// Media yêu thích (is_favorite = true) — dùng cho category card "Favorites" trên Home
router.get(
  "/favorites",
  requireAuth,
  validate(listFavoritesQuerySchema, "query"),
  respond((req) => listFavorites(req.user.id, { limit: req.query.limit, offset: req.query.offset })),
);

// Album kèm ảnh đại diện — dùng cho category card "Albums" trên Home
router.get(
  "/albums",
  requireAuth,
  validate(listAlbumsQuerySchema, "query"),
  respond((req) => listAlbumCovers(req.user.id, { limit: req.query.limit })),
);

// Lấy media của mình theo danh sách id (giữ đúng thứ tự `ids`, bỏ qua id
// không tồn tại / đã xoá / của người khác) — POST /lookup { ids }
router.post("/lookup", requireAuth, validate(lookupMediaSchema), asyncHandler(async (req, res) => {
  const items = await getMediaItemsByIds(req.user.id, req.body.ids);
  res.json({ success: true, data: { items } });
}));

// Đánh dấu yêu thích / bỏ yêu thích hàng loạt — POST /favorite { ids, favorite }
router.post("/favorite", requireAuth, validate(favoriteSchema), asyncHandler(async (req, res) => {
  const { count } = await setFavorite(
    req.user.id,
    req.body.ids,
    req.body.favorite,
  );
  res.json({ success: true, data: { updated: count } });
}));

// ============ THÙNG RÁC (soft-delete) ============
// DANH SÁCH ảnh trong thùng rác
router.get(
  "/trash",
  requireAuth,
  validate(listTrashQuerySchema, "query"),
  respond((req) => listTrash(req.user.id, { limit: req.query.limit, offset: req.query.offset })),
);

// CHUYỂN VÀO THÙNG RÁC (soft delete) — POST /trash
router.post("/trash", requireAuth, validate(mediaIdsSchema), asyncHandler(async (req, res) => {
  const { count } = await softDeleteMedia(req.user.id, req.body.ids);
  res.json({ success: true, data: { deleted: count } });
}));

// KHÔI PHỤC từ thùng rác
router.post("/restore", requireAuth, validate(mediaIdsSchema), asyncHandler(async (req, res) => {
  const { count } = await restoreMedia(req.user.id, req.body.ids);
  res.json({ success: true, data: { restored: count } });
}));

// XOÁ VĨNH VIỄN (gỡ khỏi DB + MinIO)
router.post("/trash/permanent", requireAuth, validate(mediaIdsSchema), asyncHandler(async (req, res) => {
  const { count } = await permanentDeleteMedia(req.user.id, req.body.ids);
  res.json({ success: true, data: { deleted: count } });
}));

// DỌN SẠCH THÙNG RÁC — xoá vĩnh viễn mọi media đã soft-delete
router.post("/trash/empty", requireAuth, asyncHandler(async (req, res) => {
  const { count } = await emptyTrash(req.user.id);
  res.json({ success: true, data: { deleted: count } });
}));

router.post(
  "/",
  requireAuth,
  uploadLimit,
  upload.array("media", 20),
  async (req, res, next) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          error: { code: "NO_FILES", message: "Không có file nào được gửi lên" },
        });
      }
      // Optional `meta` text field (JSON array, index ↔ file) — see media.schema.js::parseUploadMeta.
      const meta = parseUploadMeta(req.body?.meta, req.files.length);
      const uploaded = await uploadMedia(req.user.id, req.files, meta);
      res.status(201).json({ success: true, data: { uploaded } });
    } catch (error) {
      next(error);
    } finally {
      await Promise.all(
        (req.files ?? []).map((f) => fs.rm(f.path, { force: true })),
      );
    }
  },
);

// ============ UPLOAD CHIA NHỎ (resumable) — file lớn, xem media.chunked.service.js ============
const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CHUNK_BYTES, files: 1 },
});

router.post("/uploads", requireAuth, uploadLimit, validate(startChunkedSchema), respond((req) =>
  startChunkedUpload(req.user.id, req.body),
));

router.post(
  "/uploads/:id/chunk",
  requireAuth,
  uploadChunkLimit,
  validate(chunkParamsSchema, "params"),
  validate(chunkQuerySchema, "query"),
  chunkUpload.single("chunk"),
  respond((req) => appendChunk(req.user.id, req.params.id, req.query.offset, req.file?.buffer)),
);

router.post(
  "/uploads/:id/complete",
  requireAuth,
  uploadLimit,
  validate(chunkParamsSchema, "params"),
  validate(completeChunkedSchema),
  asyncHandler(async (req, res) => {
    const item = await completeChunkedUpload(req.user.id, req.params.id, req.body.meta);
    res.status(201).json({ success: true, data: { uploaded: [item] } });
  }),
);

router.use(streamRoutes);
router.use(aiRoutes);
router.use(editRoutes);

export default router;
