// Job nền: Better Auth không tự xoá phiên đăng nhập / mã xác minh đã hết hạn.
import { dbPool } from "../../config/db.js";
import { logger } from "../../lib/logger.js";

const PURGE_EVERY_MS = 60 * 60 * 1000;

export function startAuthJobs() {
  const run = () =>
    Promise.all([
      dbPool.query(`DELETE FROM "session" WHERE "expiresAt" < now()`),
      dbPool.query(`DELETE FROM "verification" WHERE "expiresAt" < now()`),
    ]).catch((err) => logger.error({ err }, "[auth] purge error"));
  void run();
  setInterval(run, PURGE_EVERY_MS).unref();
}
