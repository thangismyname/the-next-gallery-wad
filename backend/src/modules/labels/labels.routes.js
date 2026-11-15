import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import {
  addLabelMedia,
  createLabel,
  deleteLabel,
  getMediaLabelIds,
  listLabels,
  listSaved,
  removeLabelMedia,
  seedLabels,
  updateLabel,
} from "./labels.service.js";
import {
  createLabelSchema,
  labelMediaSchema,
  labelParamsSchema,
  mediaParamsSchema,
  savedQuerySchema,
  updateLabelSchema,
} from "./labels.schema.js";
import { respond } from "../../middleware/asyncHandler.js";

// Nhãn cá nhân — mọi route chỉ chạm nhãn / ảnh của chính user (kiểm tra trong service).
const router = Router();
const byId = validate(labelParamsSchema, "params");

router.use(requireAuth);

// { seeded, totals: { all, favorites }, labels: [{ id, name, color, position, count, coverUrl }] }
router.get("/", respond((req) => listLabels(req.user.id)));
router.post("/seed", respond((req) => seedLabels(req.user.id)));
router.post(
  "/",
  validate(createLabelSchema),
  respond(async (req, res) => {
    res.status(201);
    return createLabel(req.user.id, req.body);
  }),
);

// Đặt TRƯỚC /:id.
// Ảnh của trang Yêu thích: ?filter=all|favorites|<labelId> → { total, items (+labelIds) }
router.get(
  "/saved",
  validate(savedQuerySchema, "query"),
  respond((req) => listSaved(req.user.id, req.query)),
);
router.get(
  "/media/:mediaId",
  validate(mediaParamsSchema, "params"),
  respond((req) => getMediaLabelIds(req.user.id, req.params.mediaId)),
);

router.patch(
  "/:id",
  byId,
  validate(updateLabelSchema),
  respond((req) => updateLabel(req.user.id, req.params.id, req.body)),
);
router.delete("/:id", byId, respond((req) => deleteLabel(req.user.id, req.params.id)));
router.post(
  "/:id/media",
  byId,
  validate(labelMediaSchema),
  respond((req) => addLabelMedia(req.user.id, req.params.id, req.body.mediaIds)),
);
router.post(
  "/:id/media/remove",
  byId,
  validate(labelMediaSchema),
  respond((req) => removeLabelMedia(req.user.id, req.params.id, req.body.mediaIds)),
);

export default router;
