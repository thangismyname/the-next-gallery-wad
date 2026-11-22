import { Router } from "express";
import { requireDeveloper } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { respond } from "../../middleware/asyncHandler.js";
import { httpError } from "../../middleware/errorHandler.js";
import { getLab, labRequest } from "../ai/ai.client.js";
import {
  labExpParamsSchema,
  labFileParamsSchema,
  labJobParamsSchema,
  labJobSchema,
  labPlanSchema,
  labRunParamsSchema,
} from "./lab.schema.js";

// Lab (khu Developer): kết quả experiments do ai-service đọc từ $TNG_DATASETS — chỉ đọc, để vẽ biểu đồ.
// Developer đã duyệt + admin đều xem được (requireDeveloper). Chạy / dừng / xoá run (runner): chỉ Developer đã duyệt.
const router = Router();

router.use(requireDeveloper);

router.get("/experiments", respond(() => getLab("/experiments")));

router.get(
  "/experiments/:exp/runs/:runId",
  validate(labRunParamsSchema, "params"),
  respond((req) => getLab(`/experiments/${req.params.exp}/runs/${req.params.runId}`)),
);

router.get(
  "/experiments/:exp/runs/:runId/files/:name",
  validate(labFileParamsSchema, "params"),
  respond((req) => getLab(`/experiments/${req.params.exp}/runs/${req.params.runId}/files/${req.params.name}`)),
);

router.get(
  "/history/:exp",
  validate(labExpParamsSchema, "params"),
  respond((req) => getLab(`/history/${req.params.exp}`)),
);

// ── Runner: chạy experiments từ UI (ai-service app/api/lab_runner.py) ──
const developerOnly = (req, _res, next) =>
  next(req.isDeveloper ? undefined : httpError(403, "FORBIDDEN", "Chỉ Developer đã được duyệt mới chạy được benchmark"));

router.get("/runner", respond(() => getLab("/runner")));
router.get("/runner/schema", respond(() => getLab("/runner/schema")));
router.get(
  "/runner/jobs/:jobId",
  validate(labJobParamsSchema, "params"),
  respond((req) => getLab(`/runner/jobs/${req.params.jobId}`)),
);
// Xem trước suite (không chạy gì) → Developer + admin.
router.post(
  "/runner/plan",
  validate(labPlanSchema),
  respond((req) => labRequest("/runner/plan", { method: "POST", body: req.body })),
);
router.post(
  "/runner/jobs",
  developerOnly,
  validate(labJobSchema),
  respond((req) => labRequest("/runner/jobs", { method: "POST", body: req.body })),
);
router.post(
  "/runner/jobs/:jobId/cancel",
  developerOnly,
  validate(labJobParamsSchema, "params"),
  respond((req) => labRequest(`/runner/jobs/${req.params.jobId}/cancel`, { method: "POST" })),
);
router.delete(
  "/experiments/:exp/runs/:runId",
  developerOnly,
  validate(labRunParamsSchema, "params"),
  respond((req) => labRequest(`/experiments/${req.params.exp}/runs/${req.params.runId}`, { method: "DELETE" })),
);

export default router;
