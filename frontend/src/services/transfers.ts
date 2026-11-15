// REST /api/transfers — gửi file (link/QR cho khách + gửi thẳng bạn bè).
// Khách (không đăng nhập) gửi token phiên qua header X-Transfer-Token.
import { API_URL } from "@/lib/config";
import type { Via, WrappedKey } from "@/features/share/engine/protocol";

export type TransferKind = "link" | "direct";
export type RecipientStatus = "pending" | "receiving" | "done" | "failed" | "declined";

export interface TransferFile {
  id: string;
  name: string;
  size: number;
  mime: string;
  /** library = ảnh trên server (copy / tải từ server); device = file trên máy người gửi. */
  source: "library" | "device";
  /** Thumbnail đã mã hoá (base64) — giải mã bằng khoá phiên. */
  thumb: string | null;
  relayParts: number;
  partCount: number;
}

export interface TransferRecipient {
  id: string;
  userId: string | null;
  name: string | null;
  avatarUrl: string | null;
  guest: boolean;
  status: RecipientStatus;
  via: Via | "copy" | null;
  bytes: number;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface TransferDetail {
  id: string;
  kind: TransferKind;
  role: "sender" | "recipient" | "link";
  sender: { id: string; name: string; avatarUrl: string | null } | null;
  createdAt: string;
  expiresAt: string;
  open: boolean;
  maxReceivers: number | null;
  hostOnline: boolean;
  files: TransferFile[];
  code: { value: string; expiresAt: string } | null;
  recipients?: TransferRecipient[];
  me: { recipientId: string; status: RecipientStatus; wrappedKeys: WrappedKey[] } | null;
}

export interface SentTransfer {
  id: string;
  kind: TransferKind;
  createdAt: string;
  expiresAt: string;
  open: boolean;
  fileCount: number;
  totalBytes: number;
  recipientCount: number;
  doneCount: number;
  coverThumb: string | null;
}

export interface InboxTransfer {
  id: string;
  createdAt: string;
  expiresAt: string;
  open: boolean;
  status: RecipientStatus;
  via: TransferRecipient["via"];
  fileCount: number;
  libraryCount: number;
  wrappedKeys: WrappedKey[];
  coverThumb: string | null;
  sender: { id: string; name: string; avatarUrl: string | null };
}

export interface CreateTransferInput {
  kind: TransferKind;
  files: { name: string; size: number; mime: string; mediaId?: string; thumb?: string }[];
  recipients?: { userId: string; wrappedKeys: WrappedKey[] }[];
  maxReceivers?: number | null;
}

/** Lỗi từ server — `message` lấy từ backend (4xx), `code` để FE xử lý riêng. */
export class TransferHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

const headersFor = (token?: string | null, extra?: Record<string, string>) => ({
  Accept: "application/json",
  ...(token ? { "X-Transfer-Token": token } : {}),
  ...extra,
});

async function request<T>(path: string, init: RequestInit & { token?: string | null } = {}): Promise<T> {
  const { token, headers, ...rest } = init;
  const response = await fetch(`${API_URL}/transfers${path}`, {
    credentials: "include",
    ...rest,
    headers: { ...headersFor(token), ...(headers as Record<string, string>) },
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new TransferHttpError(
      json?.error?.message ?? `HTTP ${response.status}`,
      response.status,
      json?.error?.code,
    );
  }
  return (json?.data ?? json) as T;
}

const jsonBody = (body: unknown) => ({
  body: JSON.stringify(body),
  headers: { "Content-Type": "application/json" },
});

export const transfersQueryKey = ["transfers"] as const;

export const fetchTransfers = () => request<{ sent: SentTransfer[]; inbox: InboxTransfer[] }>("");

export const fetchTransfer = (id: string, token?: string | null) =>
  request<TransferDetail>(`/${id}`, { token });

export const createTransfer = (input: CreateTransferInput) =>
  request<{ id: string; token: string | null }>("", { method: "POST", ...jsonBody(input) });

export const revokeTransfer = (id: string) => request<void>(`/${id}/revoke`, { method: "POST" });

export const refreshTransferCode = (id: string) =>
  request<{ value: string; expiresAt: string }>(`/${id}/code`, { method: "POST" });

export const declineTransfer = (id: string) => request<void>(`/${id}/decline`, { method: "POST" });

/** Lưu ảnh thư viện của người gửi vào thư viện mình (copy phía server). */
export const saveLibraryFiles = (id: string, fileIds: string[], token?: string | null) =>
  request<{ saved: number }>(`/${id}/save`, { method: "POST", token, ...jsonBody({ fileIds }) });

export const redeemTransferCode = (code: string) =>
  request<{ transferId: string; token: string }>("/code", { method: "POST", ...jsonBody({ code }) });

export const fetchIceServers = (transferId: string, token?: string | null) =>
  request<{ iceServers: RTCIceServer[]; turn: boolean }>(`/ice?transferId=${transferId}`, { token });

export const registerDeviceKey = (deviceId: string, publicKey: JsonWebKey) =>
  request<void>("/keys", { method: "PUT", ...jsonBody({ deviceId, publicKey }) });

export const fetchFriendDeviceKeys = (userIds: string[]) =>
  request<Record<string, { deviceId: string; publicKey: JsonWebKey }[]>>(
    `/keys?userIds=${encodeURIComponent(userIds.join(","))}`,
  );

// ---- Relay (part đã mã hoá) + nội dung ảnh thư viện ----

const fileUrl = (id: string, fileId: string, tail: string) =>
  `${API_URL}/transfers/${id}/files/${fileId}${tail}`;

export async function uploadRelayPart(id: string, fileId: string, part: number, data: ArrayBuffer) {
  return request<{ relayParts: number; partCount: number }>(`/${id}/files/${fileId}/parts/${part}`, {
    method: "PUT",
    body: data,
    headers: { "Content-Type": "application/octet-stream" },
  });
}

export const fetchRelayParts = (id: string, fileId: string, token?: string | null) =>
  request<{ parts: number[] }>(`/${id}/files/${fileId}/parts`, { token }).then((r) => r.parts);

export async function downloadRelayPart(id: string, fileId: string, part: number, token?: string | null) {
  const response = await fetch(fileUrl(id, fileId, `/parts/${part}`), {
    credentials: "include",
    headers: headersFor(token),
  });
  if (!response.ok) throw new TransferHttpError(`HTTP ${response.status}`, response.status);
  return response.arrayBuffer();
}

/** Ảnh thư viện trong phiên link — stream bản gốc từ byte `offset` (Range). */
export async function openLibraryContent(id: string, fileId: string, offset: number, token?: string | null) {
  const response = await fetch(fileUrl(id, fileId, "/content"), {
    credentials: "include",
    headers: headersFor(token, offset > 0 ? { Range: `bytes=${offset}-` } : {}),
  });
  if (!response.ok || !response.body) {
    throw new TransferHttpError(`HTTP ${response.status}`, response.status);
  }
  // Server bỏ qua Range (200) → đọc lại từ đầu.
  return { body: response.body, from: response.status === 206 ? offset : 0 };
}
