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

const router = Router();

// Bọc handler async: lỗi → errorHandler.
const handle = (fn) => async (req, res, next) => {
  try {
    res.json({ success: true, data: await fn(req) });
  } catch (error) {
    next(error);
  }
};

// Tổng quan: số liệu nhanh + hoạt động 30 ngày + người dùng mới.
router.get("/overview", requireAdmin, handle(() => adminService.getOverview()));

// ai-service online? + tiến độ AI toàn hệ thống.
router.get("/system", requireAdmin, handle(() => adminService.getSystem()));

router.get(
  "/users",
  requireAdmin,
  validate(listUsersQuerySchema, "query"),
  handle((req) => adminService.listUsers(req.query)),
);

router.get(
  "/users/:userId",
  requireAdmin,
  validate(userParamsSchema, "params"),
  handle((req) => adminService.getUserDetail(req.params.userId)),
);

router.delete("/users/:userId", requireAdmin, validate(userParamsSchema, "params"), async (req, res, next) => {
  try {
    const data = await adminService.deleteUser(
      req.params.userId,
      req.user?.id
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get("/developer-requests", requireAdmin, validate(listDeveloperRequestsQuerySchema, "query"), async (req, res, next) => {
  try {
    const data = await developerService.listDeveloperRequests(
      req.query.status ?? null
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/developer-requests/:id/review",
  requireAdmin,
  validate(reviewParamsSchema, "params"),
  validate(reviewDeveloperRequestSchema),
  async (req, res, next) => {
    try {
      const data = await developerService.reviewDeveloperRequest(
        req.params.id,
        req.user.id,
        req.body.approve
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

