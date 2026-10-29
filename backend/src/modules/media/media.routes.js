import fs from "fs/promises";
import express, { Router } from "express";
import multer from "multer";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { backfillLimit, downloadLimit, searchLimit, uploadLimit } from "../../middleware/rateLimit.js";
import { attachmentHeader, streamMediaZip } from "./media.download.service.js";
import {
  listMediaQuerySchema,
  listAlbumsQuerySchema,
  searchQuerySchema,
  embedBackfillSchema,
  detectBackfillSchema,
  listFavoritesQuerySchema,
  listTrashQuerySchema,
  mediaIdsSchema,
  favoriteSchema,
  lookupMediaSchema,
  similarBackfillSchema,
  mediaIdParamsSchema,
  similarQuerySchema,
  tagBackfillSchema,
  tagParamsSchema,
  tagMediaQuerySchema,
  mediaSearchQuerySchema,
  objectSearchQuerySchema,
  zipDownloadSchema,
} from "./media.schema.js";
import {
  listMedia,
  listFavorites,
  listAlbumCovers,
  setFavorite,
  getMediaItemsByIds,
} from "./media.list.service.js";
import { uploadMedia } from "./media.upload.service.js";
import { classifyUpload } from "./media.sources.js";
import { authorizeMediaRequest } from "./media.access.js";
import {
  softDeleteMedia,
  listTrash,
  restoreMedia,
  permanentDeleteMedia,
  emptyTrash,
} from "./media.trash.service.js";
import {
  getThumbnailInfo,
  getFileInfo,
  createMediaStream,
  createMediaRangeStream,
  getObjectSize,
  parseRange,
} from "./media.stream.service.js";
import {
  searchMedia,
  searchAlbums,
  searchMediaObjects,
  searchSimilarMedia,
  searchMediaByTag,
} from "./media.search.service.js";
import {
  getEmbeddingStats,
  backfillEmbeddings,
} from "../ai/embedding.service.js";
import {
  backfillDetections,
  listDetectionClasses,
  getDetectionStats,
  getMediaDetections,
} from "../ai/detection.service.js";
import {
  getDinoStats,
  backfillDinoEmbeddings,
} from "../ai/similarity.service.js";
import {
  getTagStats,
  backfillTags,
  listTagSummary,
} from "../ai/tagging.service.js";

const router = Router();

// File lưu tạm ra đĩa (không giữ trong RAM) — ảnh/video có thể vài trăm MB.
// uploadMedia stream từ đĩa lên MinIO; route xoá file tạm khi xong.
const upload = multer({
  storage: multer.diskStorage({}),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // Theo MIME, fallback theo đuôi (HEIC/MOV từ Windows/Android hay thiếu MIME).
    if (!classifyUpload(file).mediaType) {
      return cb(new Error("Chỉ chấp nhận file ảnh hoặc video"));
    }
    cb(null, true);
  },
});

router.get("/", requireAuth, validate(listMediaQuerySchema, "query"), async (req, res, next) => {
  try {
    const data = await listMedia(req.user.id, {
      limit: req.query.limit,
      offset: req.query.offset,
      sort: req.query.sort,
      type: req.query.type,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Media yêu thích (is_favorite = true) — dùng cho category card "Favorites" trên Home
router.get("/favorites", requireAuth, validate(listFavoritesQuerySchema, "query"), async (req, res, next) => {
  try {
    const data = await listFavorites(req.user.id, {
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Album kèm ảnh đại diện — dùng cho category card "Albums" trên Home
router.get("/albums", requireAuth, validate(listAlbumsQuerySchema, "query"), async (req, res, next) => {
  try {
    const data = await listAlbumCovers(req.user.id, {
      limit: req.query.limit,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Lấy media của mình theo danh sách id (giữ đúng thứ tự `ids`, bỏ qua id
// không tồn tại / đã xoá / của người khác) — POST /lookup { ids }
router.post("/lookup", requireAuth, validate(lookupMediaSchema), async (req, res, next) => {
  try {
    const items = await getMediaItemsByIds(req.user.id, req.body.ids);
    res.json({ success: true, data: { items } });
  } catch (error) {
    next(error);
  }
});

// Đánh dấu yêu thích / bỏ yêu thích hàng loạt — POST /favorite { ids, favorite }
router.post("/favorite", requireAuth, validate(favoriteSchema), async (req, res, next) => {
  try {
    const { count } = await setFavorite(
      req.user.id,
      req.body.ids,
      req.body.favorite,
    );
    res.json({ success: true, data: { updated: count } });
  } catch (error) {
    next(error);
  }
});

// ============ THÙNG RÁC (soft-delete) ============
// DANH SÁCH ảnh trong thùng rác
router.get("/trash", requireAuth, validate(listTrashQuerySchema, "query"), async (req, res, next) => {
  try {
    const data = await listTrash(req.user.id, {
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// CHUYỂN VÀO THÙNG RÁC (soft delete) — POST /trash
router.post("/trash", requireAuth, validate(mediaIdsSchema), async (req, res, next) => {
  try {
    const { count } = await softDeleteMedia(req.user.id, req.body.ids);
    res.json({ success: true, data: { deleted: count } });
  } catch (error) {
    next(error);
  }
});

// KHÔI PHỤC từ thùng rác
router.post("/restore", requireAuth, validate(mediaIdsSchema), async (req, res, next) => {
  try {
    const { count } = await restoreMedia(req.user.id, req.body.ids);
    res.json({ success: true, data: { restored: count } });
  } catch (error) {
    next(error);
  }
});

// XOÁ VĨNH VIỄN (gỡ khỏi DB + MinIO)
router.post("/trash/permanent", requireAuth, validate(mediaIdsSchema), async (req, res, next) => {
  try {
    const { count } = await permanentDeleteMedia(req.user.id, req.body.ids);
    res.json({ success: true, data: { deleted: count } });
  } catch (error) {
    next(error);
  }
});

// DỌN SẠCH THÙNG RÁC — xoá vĩnh viễn mọi media đã soft-delete
router.post("/trash/empty", requireAuth, async (req, res, next) => {
  try {
    const { count } = await emptyTrash(req.user.id);
    res.json({ success: true, data: { deleted: count } });
  } catch (error) {
    next(error);
  }
});

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
      const uploaded = await uploadMedia(req.user.id, req.files);
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

// Tìm ảnh theo tên file — Spotlight search
router.get("/search", requireAuth, searchLimit, validate(mediaSearchQuerySchema, "query"), async (req, res, next) => {
  try {
    const data = await searchMedia(req.user.id, req.query.q, {
      mode: req.query.mode,
      scope: req.query.scope,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Tìm album theo tên — Spotlight search
router.get("/albums/search", requireAuth, searchLimit, validate(searchQuerySchema, "query"), async (req, res, next) => {
  try {
    const data = await searchAlbums(req.user.id, req.query.q);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// ============ SEMANTIC SEARCH (OpenCLIP embeddings) ============
// Trạng thái embedding của user: tổng ảnh / đã embed / còn thiếu.
router.get("/embed/status", requireAuth, async (req, res, next) => {
  try {
    const data = await getEmbeddingStats(req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Tạo embedding CLIP cho các ảnh cũ chưa xử lý — chạy theo lô.
router.post("/embed/backfill", requireAuth, backfillLimit, validate(embedBackfillSchema), async (req, res, next) => {
  try {
    const data = await backfillEmbeddings(req.user.id, {
      limit: req.body.limit,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// ============ OBJECT DETECTION (YOLO26) ============
// Tạo detection YOLO cho các ảnh cũ chưa xử lý — chạy theo lô.
router.post("/detection/backfill", requireAuth, backfillLimit, validate(detectBackfillSchema), async (req, res, next) => {
  try {
    const data = await backfillDetections(req.user.id, {
      limit: req.body.limit,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Tìm ảnh theo ĐỐI TƯỢNG (class COCO, khớp mờ class_name) — Spotlight search
router.get("/objects/search", requireAuth, searchLimit, validate(objectSearchQuerySchema, "query"), async (req, res, next) => {
  try {
    const data = await searchMediaObjects(req.user.id, req.query.q, { scope: req.query.scope });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Danh sách class đã phát hiện (kèm số ảnh) — gợi ý cho ô search
router.get("/objects/classes", requireAuth, async (req, res, next) => {
  try {
    const data = await listDetectionClasses(req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Thống kê ảnh đã/chưa chạy detection
router.get("/detection/status", requireAuth, async (req, res, next) => {
  try {
    const data = await getDetectionStats(req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// ============ IMAGE SIMILARITY (DINOv3) ============
// Thống kê ảnh đã/chưa có descriptor DINOv3
router.get("/similar/status", requireAuth, async (req, res, next) => {
  try {
    const data = await getDinoStats(req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Tạo descriptor DINOv3 cho các ảnh cũ chưa xử lý — chạy theo lô.
router.post("/similar/backfill", requireAuth, backfillLimit, validate(similarBackfillSchema), async (req, res, next) => {
  try {
    const data = await backfillDinoEmbeddings(req.user.id, {
      limit: req.body.limit,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// ============ CONTENT TAGGING (classification, 17 tag) ============
// Thống kê ảnh đã/chưa gắn tag
router.get("/tags/status", requireAuth, async (req, res, next) => {
  try {
    const data = await getTagStats(req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Gắn tag cho các ảnh cũ chưa có tag — chạy theo lô.
router.post("/tags/backfill", requireAuth, backfillLimit, validate(tagBackfillSchema), async (req, res, next) => {
  try {
    const data = await backfillTags(req.user.id, { limit: req.body.limit });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Tổng quan theo tag (số ảnh đạt ngưỡng + ảnh bìa) — lưới danh mục AI Studio
router.get("/tags", requireAuth, async (req, res, next) => {
  try {
    const data = await listTagSummary(req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Ảnh của 1 tag, xếp theo confidence giảm dần (kèm `score`)
router.get(
  "/tags/:tag/media",
  requireAuth,
  validate(tagParamsSchema, "params"),
  validate(tagMediaQuerySchema, "query"),
  async (req, res, next) => {
    try {
      const data = await searchMediaByTag(req.user.id, req.params.tag, req.query);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

// Ảnh / video chỉ tải được bằng URL có chữ ký (backend trả sẵn trong mọi
// API) hoặc khi là chủ ảnh đang đăng nhập — xem media.access.js.
const FORBIDDEN = {
  success: false,
  error: { code: "MEDIA_FORBIDDEN", message: "Link ảnh không hợp lệ hoặc đã hết hạn" },
};

router.get("/:id/thumbnail", async (req, res, next) => {
  try {
    const size = ["small", "display", "full"].includes(req.query.size)
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
      console.error(`Lỗi stream thumbnail ${info.objectToStream}:`, err);
      if (!res.headersSent) res.status(500).json({ success: false, error: { code: "STREAM_ERROR", message: "Stream error" } });
    });
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
});

router.get("/:id/file", async (req, res, next) => {
  try {
    const access = await authorizeMediaRequest(req, req.params.id, "file");
    if (!access) return res.status(403).json(FORBIDDEN);
    const info = await getFileInfo(req.params.id);

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
    if (req.query.download === "1") {
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
      console.error(`Lỗi stream file ${info.objectToStream}:`, err);
      if (!res.headersSent) res.status(500).json({ success: false, error: { code: "STREAM_ERROR", message: "Stream error" } });
      else res.destroy(err);
    });
    // Client huỷ request (tua video liên tục) → đóng luôn stream MinIO.
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
});

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

// Detection (kèm bbox) của 1 ảnh — dùng cho Developer Mode overlay
router.get("/:id/detections", requireAuth, validate(mediaIdParamsSchema, "params"), async (req, res, next) => {
  try {
    const data = await getMediaDetections(
      req.params.id,
      req.user.id,
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Ảnh tương tự của 1 ảnh — Lightbox ("Ảnh tương tự")
router.get(
  "/:id/similar",
  requireAuth,
  validate(mediaIdParamsSchema, "params"),
  validate(similarQuerySchema, "query"),
  async (req, res, next) => {
    try {
      const data = await searchSimilarMedia(req.user.id, req.params.id, {
        limit: req.query.limit,
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
