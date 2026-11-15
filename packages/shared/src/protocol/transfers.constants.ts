// Hằng số + message DataChannel của tính năng gửi file. Bản sao các hằng số
// backend ở backend/src/modules/transfers/transfers.constants.js — đổi cùng nhau.

/** Part relay = 4 MiB dữ liệu gốc (mã hoá AES-GCM → +16 byte tag). */
export const RELAY_PART_SIZE = 4 * 1024 * 1024;
export const RELAY_MAX_BYTES = 5 * 1024 ** 3;
export const partCount = (size: number) => Math.max(1, Math.ceil(size / RELAY_PART_SIZE));

/** Mảnh gửi qua DataChannel — 64 KiB an toàn cho mọi trình duyệt. */
export const DC_CHUNK = 64 * 1024;
/** Kiểm soát tốc độ: dừng khi hàng đợi gửi > 8 MiB, chạy tiếp khi < 1 MiB. */
export const DC_HIGH_WATER = 8 * 1024 * 1024;
export const DC_LOW_WATER = 1024 * 1024;

/** Người gửi phục vụ tối đa 3 người nhận song song (băng thông tải lên có hạn). */
export const MAX_PARALLEL_STREAMS = 3;
/** Không mở được DataChannel trong 15 s (đã thử STUN + TURN) → dùng relay. */
export const CONNECT_TIMEOUT_MS = 15_000;

// ---- Message JSON trên DataChannel (binary frame = dữ liệu file giữa begin…end) ----
export type DcMessage =
  /** Người nhận → gửi: xin file từ byte `offset` (tải tiếp sau khi rớt mạng). */
  | { t: "get"; fileId: string; offset: number }
  | { t: "cancel" }
  /** Người gửi → nhận. */
  | { t: "queued" }
  | { t: "begin"; fileId: string; offset: number; size: number }
  | { t: "end"; fileId: string }
  | { t: "error"; fileId: string; message: string };

// ---- Dữ liệu "xfer:signal" (server chỉ chuyển tiếp) ----
export type SignalData =
  | { kind: "offer"; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; candidate: RTCIceCandidateInit }
  /** Người nhận chưa có khoá (vào bằng mã 6 số) → ECDH với người gửi. */
  | { kind: "key-req"; pub: JsonWebKey }
  | { kind: "key"; wrapped: WrappedKey }
  /** Người nhận xin kết nối lại (P2P hỏng / tải lại trang). */
  | { kind: "hello" };

export interface WrappedKey {
  deviceId: string;
  epk: JsonWebKey;
  iv: string;
  ct: string;
}

/** Cách 1 người nhận đang/đã nhận file. */
export type Via = "p2p" | "turn" | "relay" | "server";
