// Job nền cho Moments:
//   1. Xoá draft collab quá hạn (tạo > 24h mà vẫn còn slot trống) — P2.3.
//   2. Dọn object meme mồ côi trong MinIO (`moments/…` không còn row trỏ tới) — P2.2.
// Trước đây việc dọn draft chỉ chạy lazy khi có người mở feed → không ai mở thì
// rác nằm mãi. Giờ chạy định kỳ, feed không còn DELETE trên đường đọc.
import { cleanupExpiredDrafts } from "./moments.feed.service.js";
import { cleanupOrphanMemeObjects } from "./moments.meme.service.js";
import { logger } from "../../lib/logger.js";

const CLEANUP_EVERY_MS = 15 * 60 * 1000;

async function runCleanup() {
  const drafts = await cleanupExpiredDrafts();
  if (drafts > 0) {
    logger.info(`[moments] Đã xoá ${drafts} draft collab quá hạn`);
  }

  const objects = await cleanupOrphanMemeObjects();
  if (objects > 0) {
    logger.info(`[moments] Đã xoá ${objects} object meme mồ côi`);
  }
}

export function startMomentsJobs() {
  const run = () =>
    runCleanup().catch((err) =>
      logger.error({ err }, "[moments] cleanup error"),
    );
  void run();
  setInterval(run, CLEANUP_EVERY_MS).unref();
}
