// Vòng lặp chung cho các script backfill AI (embed / detect / dino / tags):
// lấy danh sách user còn ảnh cần xử lý → mỗi user chạy từng lô tới khi
// remaining = 0 → in tổng kết. Script chỉ khai báo SQL + hàm xử lý 1 lô.

import { dbPool } from "../config/db.js";

/**
 * @param {object} opts
 * @param {(userId: string|null) => Promise<{ sql: string, params: unknown[] }>} opts.listUsers
 *   SQL trả cột `user_id` (lọc theo `userId` nếu có).
 * @param {(userId: string, opts: { limit: number }) => Promise<{ failed: number, remaining: number }>} opts.runBatch
 * @param {string} opts.field  tên số đếm trong kết quả lô ("embedded", "detected", "tagged").
 * @param {number} opts.batchSize
 * @param {boolean} [opts.stopOnZero]  1 lô không xử lý được ảnh nào → dừng user (ai-service lỗi).
 * @param {string} opts.summarySql  1 dòng tổng kết, in ra dạng `key=value`.
 */
export function runBackfill({ listUsers, runBatch, field, batchSize, stopOnZero = false, summarySql }) {
  const argUserId = process.argv[2]?.trim() || null;

  async function run() {
    const { sql, params } = await listUsers(argUserId);
    const userIds = (await dbPool.query(sql, params)).rows.map((row) => String(row.user_id));
    console.log(`Danh sách user cần backfill: ${userIds.length}`);

    for (const userId of userIds) {
      let total = 0;
      console.log(`== user ${userId} ==`);
      for (let pass = 1; ; pass += 1) {
        const t0 = Date.now();
        const stats = await runBatch(userId, { limit: batchSize });
        total += stats[field];
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(
          `  [pass ${pass}] ${field}=${stats[field]} failed=${stats.failed} ` +
            `remaining=${stats.remaining} (${elapsed}s, tổng ${total})`,
        );
        if (stats.remaining === 0) break;
        if (stopOnZero && stats[field] === 0) {
          console.log("  ! Lô không xử lý được ảnh nào — kiểm tra ai-service, dừng user này.");
          break;
        }
      }
    }

    const summary = (await dbPool.query(summarySql)).rows[0];
    console.log(`Done. ${Object.entries(summary).map(([k, v]) => `${k}=${v}`).join(" ")}`);
  }

  run()
    .catch((err) => {
      console.error("Backfill lỗi:", err);
      process.exitCode = 1;
    })
    .finally(() => dbPool.end());
}
