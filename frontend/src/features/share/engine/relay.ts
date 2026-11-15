// Relay qua server (dự phòng): người gửi mã hoá từng part 4 MiB rồi PUT lên
// backend (→ MinIO); người nhận GET từng part, giải mã, ghi vào sink. Part đã
// có trên server bỏ qua → tải lên / tải về tiếp được sau khi rớt mạng.
import {
  TransferHttpError,
  downloadRelayPart,
  uploadRelayPart,
} from "@/services/transfers";
import { decryptPart, encryptPart } from "./crypto";
import { RELAY_PART_SIZE, partCount } from "./protocol";
import type { FileSink } from "./sink";

const RETRIES = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw new DOMException("Đã huỷ", "AbortError");
    try {
      return await fn();
    } catch (err) {
      // Lỗi 4xx (hết hạn mức, phiên đóng…) không thử lại.
      const status = err instanceof TransferHttpError ? err.status : 0;
      if ((status >= 400 && status < 500 && status !== 429) || attempt >= RETRIES) throw err;
      await sleep(1000 * 2 ** attempt);
    }
  }
}

export async function uploadFileToRelay(args: {
  transferId: string;
  fileId: string;
  fileIndex: number;
  blob: Blob;
  key: CryptoKey;
  /** Part đã có trên server. */
  done: Set<number>;
  onPart: (relayParts: number) => void;
  signal?: AbortSignal;
}) {
  const { transferId, fileId, fileIndex, blob, key, done, onPart, signal } = args;
  const total = partCount(blob.size);
  for (let part = 0; part < total; part++) {
    if (done.has(part)) continue;
    const plain = await blob.slice(part * RELAY_PART_SIZE, (part + 1) * RELAY_PART_SIZE).arrayBuffer();
    const sealed = await encryptPart(key, fileIndex, part, plain);
    const result = await withRetry(() => uploadRelayPart(transferId, fileId, part, sealed), signal);
    done.add(part);
    onPart(result.relayParts);
  }
}

/**
 * Tải 1 file từ relay vào sink, bắt đầu ở part chứa byte `sink.size` (cắt phần
 * lẻ để luôn ghi từ đầu part). `waitForPart` chờ tới khi part đã được tải lên.
 */
export async function downloadFileFromRelay(args: {
  transferId: string;
  token: string | null;
  fileId: string;
  fileIndex: number;
  size: number;
  key: CryptoKey;
  sink: FileSink;
  waitForPart: (part: number) => Promise<void>;
  onBytes: (bytes: number) => void;
  signal?: AbortSignal;
}) {
  const { transferId, token, fileId, fileIndex, size, key, sink, waitForPart, onBytes, signal } = args;
  const total = partCount(size);
  const start = Math.floor(sink.size / RELAY_PART_SIZE);
  await sink.truncate(start * RELAY_PART_SIZE);
  for (let part = start; part < total; part++) {
    await waitForPart(part);
    const sealed = await withRetry(async () => {
      try {
        return await downloadRelayPart(transferId, fileId, part, token);
      } catch (err) {
        // Part chưa lên kịp (404) → chờ thêm rồi thử lại.
        if (err instanceof TransferHttpError && err.status === 404) {
          await waitForPart(part);
          throw new TransferHttpError("retry", 503);
        }
        throw err;
      }
    }, signal);
    const plain = await decryptPart(key, fileIndex, part, sealed);
    await sink.write(plain);
    onBytes(plain.byteLength);
  }
}
