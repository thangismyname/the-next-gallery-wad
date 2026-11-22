import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { respond } from "../../middleware/asyncHandler.js";
import { notificationParamsSchema } from "./notifications.schema.js";
import { clearNotifications, deleteNotification, listNotifications } from "./notifications.service.js";

// /api/notifications — chỉ thông báo của chính mình (user_id kiểm tra trong service).
const router = Router();
router.use(requireAuth);

router.get("/", respond((req) => listNotifications(req.user.id)));
router.delete("/", respond((req) => clearNotifications(req.user.id)));
router.delete(
  "/:id",
  validate(notificationParamsSchema, "params"),
  respond((req) => deleteNotification(req.user.id, req.params.id)),
);

export default router;
