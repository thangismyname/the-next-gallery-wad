// Khoá thiết bị ECDH P-256: khoá riêng KHÔNG export được, nằm trong IndexedDB
// của trình duyệt này; khoá công khai đăng ký lên server để bạn bè bọc khoá
// phiên gửi cho mình (nhận được cả khi người gửi đã offline).
import { registerDeviceKey } from "@/services/transfers";
import { exportPublicJwk, generateEcdhPair, toB64, unwrapTransferKey } from "./crypto";
import { idbGet, idbSet } from "./idb";
import type { WrappedKey } from "./protocol";

interface DeviceIdentity {
  deviceId: string;
  keyPair: CryptoKeyPair;
}

let identityPromise: Promise<DeviceIdentity> | null = null;

export function getDeviceIdentity(): Promise<DeviceIdentity> {
  identityPromise ??= (async () => {
    const saved = await idbGet<DeviceIdentity>("device-identity");
    if (saved?.keyPair?.privateKey) return saved;
    const identity = {
      deviceId: toB64(crypto.getRandomValues(new Uint8Array(16))),
      keyPair: await generateEcdhPair(false),
    };
    await idbSet("device-identity", identity);
    return identity;
  })();
  return identityPromise;
}

let registered = false;

/** Gọi khi đã đăng nhập (MainLayout) — đăng ký khoá công khai 1 lần / phiên làm việc. */
export async function ensureDeviceKeyRegistered() {
  if (registered) return;
  const { deviceId, keyPair } = await getDeviceIdentity();
  await registerDeviceKey(deviceId, await exportPublicJwk(keyPair.publicKey));
  registered = true;
}

/** Mở khoá phiên được bọc cho thiết bị này (bạn bè gửi thẳng). null = bọc cho máy khác. */
export async function unwrapForThisDevice(wrappedKeys: WrappedKey[]) {
  const { deviceId, keyPair } = await getDeviceIdentity();
  const mine = wrappedKeys.find((w) => w.deviceId === deviceId);
  if (!mine) return null;
  try {
    return await unwrapTransferKey(keyPair.privateKey, mine);
  } catch {
    return null;
  }
}
