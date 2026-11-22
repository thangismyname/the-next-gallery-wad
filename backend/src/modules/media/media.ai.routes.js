import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { backfillLimit, searchLimit } from "../../middleware/rateLimit.js";
import {
  searchQuerySchema,
  embedBackfillSchema,
  detectBackfillSchema,
  similarBackfillSchema,
  mediaIdParamsSchema,
  similarQuerySchema,
  tagBackfillSchema,
  tagParamsSchema,
  tagMediaQuerySchema,
  mediaSearchQuerySchema,
  objectSearchQuerySchema,
} from "./media.schema.js";
import {
  searchMedia,
  searchAlbums,
  searchMediaObjects,
  searchSimilarMedia,
  searchMediaByTag,
} from "./media.search.service.js";
import { getEmbeddingStats, backfillEmbeddings } from "../ai/embedding.service.js";
import {
  backfillDetections,
  listDetectionClasses,
  getDetectionStats,
  getMediaDetections,
} from "../ai/detection.service.js";
import { getDinoStats, backfillDinoEmbeddings } from "../ai/similarity.service.js";
import {
  getTagStats,
  backfillTags,
  listTagSummary,
  getTagCatalog,
  getMediaTags,
} from "../ai/tagging.service.js";
import { respond } from "../../middleware/asyncHandler.js";

/**
 * Route AI dưới /api/gallery/media: Spotlight search (hybrid / album / vật thể), trạng thái + backfill của
 * CLIP · YOLO · DINOv3 · tag, ảnh theo tag, và dữ liệu AI của 1 ảnh (tags, detections, similar).
 * Logic nằm ở modules/ai/*.service.js + media.search.service.js. Gắn vào media.routes.js.
 */
const router = Router();

// Tìm ảnh theo tên file — Spotlight search
router.get(
  "/search",
  requireAuth,
  searchLimit,
  validate(mediaSearchQuerySchema, "query"),
  respond((req) =>
    searchMedia(req.user.id, req.query.q, { mode: req.query.mode, scope: req.query.scope, tz: req.query.tz }),
  ),
);

// Tìm album theo tên — Spotlight search
router.get(
  "/albums/search",
  requireAuth,
  searchLimit,
  validate(searchQuerySchema, "query"),
  respond((req) => searchAlbums(req.user.id, req.query.q)),
);

// ============ SEMANTIC SEARCH (OpenCLIP embeddings) ============
// Trạng thái embedding của user: tổng ảnh / đã embed / còn thiếu.
router.get("/embed/status", requireAuth, respond((req) => getEmbeddingStats(req.user.id)));

// Tạo embedding CLIP cho các ảnh cũ chưa xử lý — chạy theo lô.
router.post(
  "/embed/backfill",
  requireAuth,
  backfillLimit,
  validate(embedBackfillSchema),
  respond((req) => backfillEmbeddings(req.user.id, { limit: req.body.limit })),
);

// ============ OBJECT DETECTION (YOLO26) ============
// Tạo detection YOLO cho các ảnh cũ chưa xử lý — chạy theo lô.
router.post(
  "/detection/backfill",
  requireAuth,
  backfillLimit,
  validate(detectBackfillSchema),
  respond((req) => backfillDetections(req.user.id, { limit: req.body.limit })),
);

// Tìm ảnh theo ĐỐI TƯỢNG (class COCO, khớp mờ class_name) — Spotlight search
router.get(
  "/objects/search",
  requireAuth,
  searchLimit,
  validate(objectSearchQuerySchema, "query"),
  respond((req) => searchMediaObjects(req.user.id, req.query.q, { scope: req.query.scope, tz: req.query.tz })),
);

// Danh sách class đã phát hiện (kèm số ảnh) — gợi ý cho ô search
router.get("/objects/classes", requireAuth, respond((req) => listDetectionClasses(req.user.id)));

// Thống kê ảnh đã/chưa chạy detection
router.get("/detection/status", requireAuth, respond((req) => getDetectionStats(req.user.id)));

// ============ IMAGE SIMILARITY (DINOv3) ============
// Thống kê ảnh đã/chưa có descriptor DINOv3
router.get("/similar/status", requireAuth, respond((req) => getDinoStats(req.user.id)));

// Tạo descriptor DINOv3 cho các ảnh cũ chưa xử lý — chạy theo lô.
router.post(
  "/similar/backfill",
  requireAuth,
  backfillLimit,
  validate(similarBackfillSchema),
  respond((req) => backfillDinoEmbeddings(req.user.id, { limit: req.body.limit })),
);

// ============ CONTENT TAGGING (classification, 17 tag) ============
// Thống kê ảnh đã/chưa gắn tag
router.get("/tags/status", requireAuth, respond((req) => getTagStats(req.user.id)));

// Gắn tag cho các ảnh cũ chưa có tag — chạy theo lô.
router.post(
  "/tags/backfill",
  requireAuth,
  backfillLimit,
  validate(tagBackfillSchema),
  respond((req) => backfillTags(req.user.id, { limit: req.body.limit })),
);

// Tổng quan theo tag (số ảnh đạt ngưỡng + ảnh bìa) — lưới danh mục AI Studio
router.get("/tags", requireAuth, respond((req) => listTagSummary(req.user.id)));

// Danh mục nhãn chi tiết (tên vi/en/ja + nhóm + ngưỡng) — AI Studio, Lightbox
router.get("/tags/catalog", requireAuth, respond((req) => getTagCatalog()));

// Ảnh của 1 tag, xếp theo confidence giảm dần (kèm `score`)
router.get(
  "/tags/:tag/media",
  requireAuth,
  validate(tagParamsSchema, "params"),
  validate(tagMediaQuerySchema, "query"),
  respond((req) => searchMediaByTag(req.user.id, req.params.tag, req.query)),
);

// ============ DỮ LIỆU AI CỦA 1 ẢNH ============
// Tag nội dung (danh mục + nhãn chi tiết) — Lightbox details panel
router.get(
  "/:id/tags",
  requireAuth,
  validate(mediaIdParamsSchema, "params"),
  respond((req) => getMediaTags(req.user.id, req.params.id)),
);

// Detection (kèm bbox) — Developer Mode overlay
router.get(
  "/:id/detections",
  requireAuth,
  validate(mediaIdParamsSchema, "params"),
  respond((req) => getMediaDetections(req.params.id, req.user.id)),
);

// Ảnh tương tự của 1 ảnh — Lightbox ("Ảnh tương tự")
router.get(
  "/:id/similar",
  requireAuth,
  validate(mediaIdParamsSchema, "params"),
  validate(similarQuerySchema, "query"),
  respond((req) => searchSimilarMedia(req.user.id, req.params.id, { limit: req.query.limit })),
);

export default router;
