import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import * as developerService from "./developer.service.js";
import { requestDeveloperSchema } from "./developer.schema.js";
import { respond } from "../../middleware/asyncHandler.js";

const router = Router();

router.get("/status", requireAuth, respond((req) => developerService.getDeveloperStatus(req.user.id)));

router.post(
  "/request",
  requireAuth,
  validate(requestDeveloperSchema),
  respond((req) => developerService.requestDeveloper(req.user.id, req.body.message)),
);

export default router;
