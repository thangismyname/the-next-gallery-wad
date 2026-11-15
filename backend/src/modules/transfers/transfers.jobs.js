// Job nền: dọn file relay của phiên hết hạn (1 ngày) / đã thu hồi.
import { purgeExpiredTransfers } from "./transfers.service.js";
import { ensureRelayLifecycle } from "./transfers.relay.service.js";
import { logger } from "../../lib/logger.js";

const PURGE_EVERY_MS = 15 * 60 * 1000;

export function startTransferJobs() {
  void ensureRelayLifecycle();
  const run = () =>
    purgeExpiredTransfers().catch((err) => logger.error({ err }, "[transfers] purge error"));
  void run();
  setInterval(run, PURGE_EVERY_MS).unref();
}
