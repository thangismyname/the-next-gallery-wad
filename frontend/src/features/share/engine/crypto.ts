// Mã hoá đầu-cuối cho tính năng gửi file (WebCrypto).
// - Mỗi phiên 1 khoá AES-GCM 256. Part relay + thumbnail mã hoá bằng khoá này;
//   IV = [fileIndex u32][part u32][0 u32] — duy nhất trong 1 khoá, tải lại cùng
//   part cho ra đúng bản mã cũ (resume an toàn).
// - Khoá đến người nhận: link/QR = trong #fragment (không gửi lên server);
//   bạn bè = bọc bằng ECDH P-256 với khoá thiết bị của họ; mã 6 số = ECDH tạm
//   với người gửi qua signaling.
// P2P (WebRTC) đã mã hoá sẵn bằng DTLS nên không mã hoá thêm.
import { idbGet, idbSet } from "./idb";
import type { WrappedKey } from "./protocol";

const THUMB_PART = 0xffffffff;
const HKDF_INFO = new TextEncoder().encode("tng-transfer-v1");

export const toB64 = (bytes: ArrayBuffer | Uint8Array) => {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export const fromB64 = (b64: string) => {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};

function ivFor(fileIndex: number, part: number) {
  const iv = new Uint8Array(12);
  const view = new DataView(iv.buffer);
  view.setUint32(0, fileIndex);
  view.setUint32(4, part);
  return iv;
}

// ---- Khoá phiên ----

export const generateTransferKey = () =>
  crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);

export const exportKey = async (key: CryptoKey) => toB64(await crypto.subtle.exportKey("raw", key));

export const importKey = (b64: string) =>
  crypto.subtle.importKey("raw", fromB64(b64), "AES-GCM", true, ["encrypt", "decrypt"]);

/** Lưu khoá phiên trong máy (người gửi + người nhận) → tải lại trang vẫn giải mã được. */
export const rememberTransferKey = (transferId: string, key: CryptoKey) =>
  exportKey(key).then((raw) => idbSet(`transfer-key:${transferId}`, raw));

export async function recallTransferKey(transferId: string) {
  const raw = await idbGet<string>(`transfer-key:${transferId}`).catch(() => undefined);
  return raw ? importKey(raw) : null;
}

export const encryptPart = (key: CryptoKey, fileIndex: number, part: number, data: BufferSource) =>
  crypto.subtle.encrypt({ name: "AES-GCM", iv: ivFor(fileIndex, part) }, key, data);

export const decryptPart = (key: CryptoKey, fileIndex: number, part: number, data: BufferSource) =>
  crypto.subtle.decrypt({ name: "AES-GCM", iv: ivFor(fileIndex, part) }, key, data);

export const encryptThumb = async (key: CryptoKey, fileIndex: number, bytes: BufferSource) =>
  toB64(await encryptPart(key, fileIndex, THUMB_PART, bytes));

/** Thumbnail đã mã hoá → object URL (người gọi tự revoke). null nếu sai khoá. */
export async function decryptThumbUrl(key: CryptoKey, fileIndex: number, b64: string) {
  try {
    const plain = await decryptPart(key, fileIndex, THUMB_PART, fromB64(b64));
    return URL.createObjectURL(new Blob([plain], { type: "image/webp" }));
  } catch {
    return null;
  }
}

// ---- ECDH: bọc khoá phiên cho 1 khoá công khai ----

const ECDH = { name: "ECDH", namedCurve: "P-256" } as const;

export const generateEcdhPair = (extractable = false) =>
  crypto.subtle.generateKey(ECDH, extractable, ["deriveBits"]) as Promise<CryptoKeyPair>;

/** Chỉ giữ các trường JWK cần thiết (server kiểm tra đúng dạng). */
export async function exportPublicJwk(key: CryptoKey): Promise<JsonWebKey> {
  const { kty, crv, x, y } = await crypto.subtle.exportKey("jwk", key);
  return { kty, crv, x, y };
}

async function wrappingKey(privateKey: CryptoKey, publicJwk: JsonWebKey, usage: KeyUsage) {
  const pub = await crypto.subtle.importKey("jwk", publicJwk, ECDH, false, []);
  const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: pub }, privateKey, 256);
  const hkdf = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: HKDF_INFO },
    hkdf,
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
}

export async function wrapTransferKey(
  transferKey: CryptoKey,
  recipientPublicJwk: JsonWebKey,
  deviceId: string,
): Promise<WrappedKey> {
  const eph = await generateEcdhPair(true);
  const kek = await wrappingKey(eph.privateKey, recipientPublicJwk, "encrypt");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const raw = await crypto.subtle.exportKey("raw", transferKey);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, kek, raw);
  return { deviceId, epk: await exportPublicJwk(eph.publicKey), iv: toB64(iv), ct: toB64(ct) };
}

export async function unwrapTransferKey(privateKey: CryptoKey, wrapped: WrappedKey) {
  const kek = await wrappingKey(privateKey, wrapped.epk, "decrypt");
  const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(wrapped.iv) }, kek, fromB64(wrapped.ct));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", true, ["encrypt", "decrypt"]);
}
