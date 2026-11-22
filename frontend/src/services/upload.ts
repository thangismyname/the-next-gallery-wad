import { uploadMixed, type ChunkIO, type UploadMeta, type UploadProgress, type UploadResult } from "@tng/shared";
import { webHttp } from "@/lib/http.web";

/** File trình duyệt cho upload chia nhỏ (`@tng/shared` `import/chunked.ts`). */
const webChunkIO: ChunkIO<File> = {
  size: (f) => f.size,
  name: (f) => f.name,
  type: (f) => f.type,
  fingerprint: (f) => `${f.name}:${f.size}:${f.lastModified}`,
  slice: async (f, start, end) => ({ body: f.slice(start, end) }),
};

/**
 * POST /gallery/media với các file này (`meta[i]` đi với `files[i]`): file nhỏ gửi chung 1 request
 * multipart, file lớn (> CHUNKED_THRESHOLD, ảnh hay video) gửi từng phần 8 MiB, rớt mạng thì tiếp
 * từ chỗ dở. Kết quả theo đúng thứ tự `files`. Lỗi = HttpError như `webHttp.upload`.
 */
export function sendMedia(
  files: File[],
  meta: (UploadMeta | null)[] = [],
  opts?: { signal?: AbortSignal; onProgress?: (percent: number) => void },
) {
  return uploadMixed({
    http: webHttp,
    io: webChunkIO,
    parts: files,
    meta: files.map((_, i) => meta[i] ?? null),
    signal: opts?.signal,
    sendBatch: async (parts, batchMeta) => {
      const form = new FormData();
      for (const file of parts) form.append("media", file);
      if (batchMeta.some(Boolean)) form.append("meta", JSON.stringify(batchMeta));
      const res = await webHttp.upload<{ uploaded?: UploadResult[] }>("/gallery/media", form, opts);
      return res?.uploaded ?? [];
    },
  });
}

/**
 * Upload nhiều file theo batch (mặc định 10 file/lần — backend nhận ≤ 20/request), báo tiến độ.
 * Trả về item đã upload theo đúng thứ tự `files` (1 batch lỗi → throw, các batch trước đã lên).
 */
export async function uploadMediaInBatches(
  files: File[],
  onProgress?: (progress: UploadProgress) => void,
  batchSize = 10,
  meta?: (UploadMeta | null)[],
): Promise<any[]> {
  const uploaded: any[] = [];
  const totalCount = files.length;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    uploaded.push(
      ...(await sendMedia(batch, meta?.slice(i, i + batch.length), {
        onProgress: (percent) => onProgress?.({ uploadedCount: i, totalCount, currentBatchPercent: percent }),
      })),
    );
    onProgress?.({ uploadedCount: Math.min(i + batch.length, totalCount), totalCount, currentBatchPercent: 100 });
  }
  return uploaded;
}
