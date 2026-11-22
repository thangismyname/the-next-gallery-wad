// /api/gallery/media/:id/edit — basic edit không phá huỷ (media.edit.service.js).
import fs from "fs/promises";
import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { uploadLimit } from "../../middleware/rateLimit.js";
import { asyncHandler, respond } from "../../middleware/asyncHandler.js";
import { httpError } from "../../middleware/errorHandler.js";
import { mediaIdParamsSchema, saveEditBodySchema } from "./media.schema.js";
import { deleteEdit, getEdit, saveEdit } from "./media.edit.service.js";

const router = Router();

// Ảnh đã render ≤2048px (WebP/JPEG/PNG) — vài MB là nhiều.
const upload = multer({
  storage: multer.diskStorage({}),
  defParamCharset: "utf8", // mặc định latin1 → tên file có dấu bị lỗi font ("BaÌ\u0089n sao")
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    ["image/webp", "image/jpeg", "image/png"].includes(file.mimetype)
      ? cb(null, true)
      : cb(httpError(400, "INVALID_IMAGE", "Ảnh đã chỉnh phải là WebP, JPEG hoặc PNG")),
});

router.get(
  "/:id/edit",
  requireAuth,
  validate(mediaIdParamsSchema, "params"),
  respond((req) => getEdit(req.user.id, req.params.id)),
);

router.post(
  "/:id/edit",
  requireAuth,
  uploadLimit,
  validate(mediaIdParamsSchema, "params"),
  upload.single("image"),
  asyncHandler(async (req, res) => {
    try {
      // Kiểm tra trong try để file tạm luôn bị xoá, kể cả khi recipe sai.
      const body = saveEditBodySchema.safeParse(req.body);
      if (!body.success) throw httpError(400, "VALIDATION_ERROR", "Công thức chỉnh không hợp lệ");
      if (!req.file) throw httpError(400, "NO_FILES", "Thiếu ảnh đã chỉnh");
      res.json({ success: true, data: await saveEdit(req.user.id, req.params.id, body.data.recipe, req.file.path) });
    } finally {
      if (req.file) await fs.rm(req.file.path, { force: true });
    }
  }),
);

router.delete(
  "/:id/edit",
  requireAuth,
  validate(mediaIdParamsSchema, "params"),
  respond((req) => deleteEdit(req.user.id, req.params.id)),
);

export default router;
