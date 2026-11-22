import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { respond } from "../../middleware/asyncHandler.js";
import { importWriteLimit, uploadLimit } from "../../middleware/rateLimit.js";
import {
  createImportSchema,
  importCheckSchema,
  importParamsSchema,
  updateImportSchema,
} from "./imports.schema.js";
import { createImport, findExistingUploads, getImport, listImports, updateImport } from "./imports.service.js";

/*
 * /api/imports — phiên nhập thư viện (Google Takeout…). File vẫn upload qua POST /api/gallery/media
 * kèm `meta.importId` (+ `bulk`); module này chỉ giữ phiên, lịch sử, báo cáo và bước kiểm tra trước.
 */
const router = Router();
const byId = validate(importParamsSchema, "params");

router.use(requireAuth);

// { items: [{ name, size }] ≤ 1000 } → { exists: boolean[] } (cùng thứ tự)
router.post(
  "/check",
  uploadLimit,
  validate(importCheckSchema),
  respond(async (req) => ({ exists: await findExistingUploads(req.user.id, req.body.items) })),
);

router.get("/", respond((req) => listImports(req.user.id)));
router.post(
  "/",
  importWriteLimit,
  validate(createImportSchema),
  respond(async (req, res) => {
    res.status(201);
    return createImport(req.user.id, req.body);
  }),
);
router.get("/:id", byId, respond((req) => getImport(req.user.id, req.params.id)));
router.patch(
  "/:id",
  importWriteLimit,
  byId,
  validate(updateImportSchema),
  respond((req) => updateImport(req.user.id, req.params.id, req.body)),
);

export default router;
