import { Router } from "express";
import { requireAdmin } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import * as adminService from "./admin.service.js";
import * as developerService from "../developer/developer.service.js";
import { listUsersQuerySchema, userParamsSchema } from "./admin.schema.js";
import {
  listDeveloperRequestsQuerySchema,
  reviewParamsSchema,
  reviewDeveloperRequestSchema,
} from "../developer/developer.schema.js";
import { respond } from "../../middleware/asyncHandler.js";

const router = Router();

// Tổng quan: số liệu nhanh + hoạt động 30 ngày + người dùng mới.
router.get("/overview", requireAdmin, respond(() => adminService.getOverview()));

// ai-service online? + tiến độ AI toàn hệ thống.
router.get("/system", requireAdmin, respond(() => adminService.getSystem()));

router.get(
  "/users",
  requireAdmin,
  validate(listUsersQuerySchema, "query"),
  respond((req) => adminService.listUsers(req.query)),
);

router.get(
  "/users/:userId",
  requireAdmin,
  validate(userParamsSchema, "params"),
  respond((req) => adminService.getUserDetail(req.params.userId)),
);

router.delete(
  "/users/:userId",
  requireAdmin,
  validate(userParamsSchema, "params"),
  respond((req) => adminService.deleteUser(req.params.userId, req.user?.id )),
);

router.get(
  "/developer-requests",
  requireAdmin,
  validate(listDeveloperRequestsQuerySchema, "query"),
  respond((req) => developerService.listDeveloperRequests(req.query.status ?? null )),
);

router.post(
  "/developer-requests/:id/review",
  requireAdmin,
  validate(reviewParamsSchema, "params"),
  validate(reviewDeveloperRequestSchema),
  respond((req) => developerService.reviewDeveloperRequest(req.params.id, req.user.id, req.body.approve ))
);

export default router;

