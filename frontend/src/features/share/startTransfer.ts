// Tạo 1 phiên gửi: khoá phiên → thumbnail mã hoá → (bạn bè: bọc khoá cho từng
// thiết bị của họ) → POST /transfers → phát P2P cho file trên máy. Ảnh thư viện
// gửi bạn bè được server copy ngay; gửi qua link thì người nhận tải từ server.
import {
  createTransfer,
  fetchFriendDeviceKeys,
  fetchTransfer,
  type TransferDetail,
} from "@/services/transfers";
import { usePresence } from "@/hooks/usePresence";
import {
  encryptThumb,
  exportKey,
  generateTransferKey,
  recallTransferKey,
  rememberTransferKey,
  wrapTransferKey,
} from "./engine/crypto";
import { idbGet, idbSet } from "./engine/idb";
import { TransferHost } from "./engine/host";
import { hostRegistry } from "./engine/hostRegistry";
import { RELAY_MAX_BYTES } from "./engine/protocol";
import { thumbFromFile, thumbFromLibrary } from "./engine/thumbs";
import type { SendEntry } from "./sendEntry";

export interface StartTransferInput {
  kind: "link" | "direct";
  entries: SendEntry[];
  friendIds?: string[];
  maxReceivers?: number | null;
}

/** Link người nhận: token + khoá trong #fragment (trình duyệt không gửi phần này lên server). */
export const receiveLink = (id: string, token: string, keyB64: string | null) =>
  `${window.location.origin}/r/${id}#t=${encodeURIComponent(token)}${keyB64 ? `&k=${keyB64}` : ""}`;

/** Link đã tạo trong trình duyệt này (server chỉ giữ hash của token). */
export async function recallReceiveLink(id: string) {
  const token = await idbGet<string>(`transfer-token:${id}`).catch(() => undefined);
  if (!token) return null;
  const key = await recallTransferKey(id);
  return receiveLink(id, token, key ? await exportKey(key) : null);
}

async function wrapForFriends(key: CryptoKey, friendIds: string[]) {
  const devices = await fetchFriendDeviceKeys(friendIds).catch(() => ({}) as Awaited<ReturnType<typeof fetchFriendDeviceKeys>>);
  return Promise.all(
    friendIds.map(async (userId) => ({
      userId,
      wrappedKeys: await Promise.all(
        (devices[userId] ?? []).map((d) => wrapTransferKey(key, d.publicKey, d.deviceId)),
      ),
    })),
  );
}

export async function startTransfer(input: StartTransferInput): Promise<{
  detail: TransferDetail;
  link: string | null;
}> {
  const { kind, entries } = input;
  const key = await generateTransferKey();

  const files = await Promise.all(
    entries.map(async (entry, index) => {
      const thumb = entry.kind === "local" ? await thumbFromFile(entry.file) : await thumbFromLibrary(entry.item);
      const sealed = thumb ? await encryptThumb(key, index, thumb) : undefined;
      return entry.kind === "local"
        ? {
            name: entry.file.name,
            size: entry.file.size,
            mime: entry.file.type || "application/octet-stream",
            thumb: sealed,
          }
        : {
            name: entry.item.title ?? entry.item.id,
            size: entry.item.sizeBytes ?? 0,
            mime: entry.item.mimeType ?? "application/octet-stream",
            mediaId: entry.item.id,
            thumb: sealed,
          };
    }),
  );

  const friendIds = kind === "direct" ? (input.friendIds ?? []) : [];
  const created = await createTransfer({
    kind,
    files,
    recipients: friendIds.length ? await wrapForFriends(key, friendIds) : [],
    maxReceivers: kind === "link" ? (input.maxReceivers ?? null) : null,
  });
  await rememberTransferKey(created.id, key);
  if (created.token) await idbSet(`transfer-token:${created.id}`, created.token);

  const detail = await fetchTransfer(created.id);
  // Thứ tự file trên server = thứ tự gửi lên (position).
  const blobs = new Map<string, Blob>();
  entries.forEach((entry, i) => {
    if (entry.kind === "local" && detail.files[i]) blobs.set(detail.files[i].id, entry.file);
  });

  if (blobs.size > 0) {
    const host = new TransferHost(detail, key, blobs);
    hostRegistry.add(host);
    // Bạn bè đang offline → đẩy trước lên relay (mã hoá) để họ nhận được cả khi mình đã tắt máy.
    const deviceBytes = [...blobs.values()].reduce((sum, b) => sum + b.size, 0);
    const someoneOffline = friendIds.some((id) => !usePresence.getState().isOnline(id));
    if (kind === "direct" && someoneOffline && deviceBytes <= RELAY_MAX_BYTES) host.relayFiles();
  }

  return {
    detail,
    link: created.token ? receiveLink(created.id, created.token, await exportKey(key)) : null,
  };
}
