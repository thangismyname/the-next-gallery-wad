// Gửi file (link/QR cho khách + gửi thẳng bạn bè). FE giữ bản sao các hằng số
// liên quan ở features/share/engine/protocol.ts — đổi thì đổi cả 2 nơi.

/** Phiên gửi + file relay sống 1 ngày. */
export const TRANSFER_TTL_MS = 24 * 60 * 60 * 1000;
/** Mã 6 ký tự để nhập tay — sống ngắn (chống dò mã). */
export const CODE_TTL_MS = 10 * 60 * 1000;
export const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

/** Relay qua server: tối đa 5 GB / phiên. */
export const RELAY_MAX_BYTES = 5 * 1024 ** 3;
/** Mỗi part relay = 4 MiB dữ liệu gốc (+16 byte tag AES-GCM sau khi mã hoá). */
export const RELAY_PART_SIZE = 4 * 1024 * 1024;
export const RELAY_PART_MAX_BYTES = RELAY_PART_SIZE + 1024;
/** Prefix object relay trong bucket — có lifecycle tự xoá (dự phòng cho job dọn). */
export const RELAY_PREFIX = "transfers/";

export const MAX_FILES = 500;
export const MAX_RECIPIENTS = 50;
/** Thumbnail đã mã hoá (base64) gửi kèm manifest. */
export const MAX_THUMB_CHARS = 64 * 1024;

export const partCount = (size) => Math.max(1, Math.ceil(size / RELAY_PART_SIZE));
export const relayObjectName = (transferId, fileId, part) =>
  `${RELAY_PREFIX}${transferId}/${fileId}/${part}`;
