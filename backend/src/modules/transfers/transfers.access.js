// Ai được xem / tải 1 phiên gửi:
//   - sender: chủ phiên (cookie).
//   - recipient: bạn bè được gửi thẳng (cookie + dòng transfer_recipients).
//   - link: có token link/QR (transfers.token_hash) hoặc token riêng của khách
//     vào bằng mã 6 số (transfer_recipients.access_hash). Đăng nhập hay không đều được.
// Phiên hết hạn / đã thu hồi → 410 (trừ sender, vẫn xem được lịch sử).
import { createHash, randomBytes } from "node:crypto";
import { dbPool } from "../../config/db.js";
import { httpError } from "../../middleware/errorHandler.js";

export const hashToken = (token) => createHash("sha256").update(String(token)).digest("hex");
export const newToken = () => randomBytes(24).toString("base64url");

const TRANSFER_COLUMNS = `t.id, t.sender_id, t.kind, t.code, t.code_expires_at, t.max_receivers,
  t.expires_at, t.revoked_at, t.purged_at, t.created_at`;

export const isTransferOpen = (t) =>
  !t.revoked_at && !t.purged_at && new Date(t.expires_at).getTime() > Date.now();

/**
 * @param {{ transferId: string, token?: string | null, userId?: string | null }} who
 * @returns {Promise<{ transfer, role: "sender" | "recipient" | "link", recipient: object | null }>}
 */
export async function resolveTransferAccess({ transferId, token, userId }) {
  const { rows } = await dbPool.query(
    `SELECT ${TRANSFER_COLUMNS}, t.token_hash FROM transfers t WHERE t.id = $1`,
    [transferId],
  );
  const transfer = rows[0];
  if (!transfer) throw httpError(404, "TRANSFER_NOT_FOUND", "Không tìm thấy phiên gửi");

  let role = null;
  let recipient = null;
  if (userId && transfer.sender_id === userId) {
    role = "sender";
  } else if (token) {
    const hash = hashToken(token);
    if (transfer.token_hash && transfer.token_hash === hash) {
      role = "link";
    } else {
      const r = await dbPool.query(
        `SELECT * FROM transfer_recipients WHERE transfer_id = $1 AND access_hash = $2`,
        [transferId, hash],
      );
      if (r.rows[0]) {
        role = "link";
        recipient = r.rows[0];
      }
    }
  }
  if (!role && userId) {
    const r = await dbPool.query(
      `SELECT * FROM transfer_recipients WHERE transfer_id = $1 AND user_id = $2`,
      [transferId, userId],
    );
    if (r.rows[0]) {
      role = transfer.kind === "direct" ? "recipient" : "link";
      recipient = r.rows[0];
    }
  }
  // Không có quyền → 404 (không lộ phiên có tồn tại hay không).
  if (!role) throw httpError(404, "TRANSFER_NOT_FOUND", "Không tìm thấy phiên gửi");
  if (role !== "sender" && !isTransferOpen(transfer)) {
    throw httpError(410, "TRANSFER_CLOSED", "Phiên gửi đã hết hạn hoặc bị thu hồi");
  }
  delete transfer.token_hash;
  return { transfer, role, recipient };
}

/** Express: đọc token từ header X-Transfer-Token (khách) + user từ cookie (nếu có). */
export function accessFromRequest(req) {
  return resolveTransferAccess({
    transferId: req.params.id,
    token: req.get("x-transfer-token") || null,
    userId: req.user?.id ?? null,
  });
}
