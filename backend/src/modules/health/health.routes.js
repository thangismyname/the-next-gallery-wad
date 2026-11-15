import { Router } from "express";
import { dbPool } from "../../config/db.js";
import { minioClient, BUCKET_NAME } from "../../config/minio.js";

const router = Router();

router.get("/", (_req, res) => {
  res.json({ success: true, data: { status: "ok" } });
});

// Readiness check: DB + MinIO phải reachable.
router.get("/ready", async (_req, res) => {
  const checks = {};
  let ok = true;

  try {
    await dbPool.query("SELECT 1");
    checks.db = "ok";
  } catch (e) {
    checks.db = "error";
    ok = false;
  }

  try {
    await minioClient.bucketExists(BUCKET_NAME);
    checks.minio = "ok";
  } catch (e) {
    checks.minio = "error";
    ok = false;
  }

  res.status(ok ? 200 : 503).json({
    success: ok,
    data: { status: ok ? "ready" : "not_ready", checks },
  });
});

export default router;