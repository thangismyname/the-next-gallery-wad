// Resumable chunked upload for big files (photo or video) — backend `media.chunked.service.js`.
// Files > CHUNKED_THRESHOLD skip the multipart batch and go 8 MiB at a time; a dropped connection
// (or a reload: the server keys the session by `fingerprint`) continues from the server's offset.
import { HttpError, type HttpClient } from "../http";
import type { UploadMeta } from "../types/media";

/** Above this a file is sent in chunks (keep the per-request multer limit well above it). */
export const CHUNKED_THRESHOLD = 32 * 1024 * 1024;
/** Quick retries of one chunk after a network / 5xx error before giving up to the upload loop. */
const CHUNK_RETRIES = 4;

export type UploadResult = { duplicate?: boolean };

/** How to read a platform file (web File, RN `{ uri, name, type }`). */
export interface ChunkIO<P> {
  size: (part: P) => number;
  name: (part: P) => string;
  type: (part: P) => string;
  /** Same file → same string (name + size + mtime / uri) — picks up an unfinished session. */
  fingerprint: (part: P) => string;
  /** Bytes [start, end) as a FormData value; `release` frees temp files once it is sent. */
  slice: (part: P, start: number, end: number) => Promise<{ body: Blob; release?: () => void }>;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });

const serverOffset = (err: unknown) => {
  const offset = (err as HttpError)?.payload as { error?: { details?: { offset?: unknown } } } | undefined;
  return typeof offset?.error?.details?.offset === "number" ? offset.error.details.offset : null;
};

// Big files already finished in this tab: a retried batch (another file failed) doesn't send them again.
const finished = new Map<string, UploadResult>();

/** One big file: start / resume → chunks → complete. Throws like `http.upload` (the loop retries). */
export async function uploadResumable<P>(
  http: HttpClient,
  io: ChunkIO<P>,
  part: P,
  meta: UploadMeta | null,
  signal?: AbortSignal,
): Promise<UploadResult> {
  const fingerprint = io.fingerprint(part);
  const done = finished.get(fingerprint);
  if (done) return done;

  const size = io.size(part);
  const started = await http.post<{ uploadId: string; offset: number; chunkSize: number }>(
    "/gallery/media/uploads",
    { name: io.name(part), size, mimeType: io.type(part), fingerprint },
    { signal },
  );
  const { uploadId, chunkSize } = started;
  let offset = started.offset;
  let errors = 0;
  while (offset < size) {
    const { body, release } = await io.slice(part, offset, Math.min(size, offset + chunkSize));
    const form = new FormData();
    form.append("chunk", body);
    try {
      ({ offset } = await http.upload<{ offset: number }>(
        `/gallery/media/uploads/${uploadId}/chunk?offset=${offset}`,
        form,
        { signal },
      ));
      errors = 0;
    } catch (err) {
      if (signal?.aborted) throw err;
      const status = err instanceof HttpError ? err.status : 0;
      const at = serverOffset(err);
      // Server has a different offset (a chunk landed but its reply was lost) → continue from there.
      if (status === 409 && at !== null) offset = at;
      else if ((status === 0 || status >= 500) && ++errors <= CHUNK_RETRIES) await sleep(1000 * errors, signal);
      else throw err;
    } finally {
      release?.();
    }
  }
  const res = await http.post<{ uploaded?: UploadResult[] }>(
    `/gallery/media/uploads/${uploadId}/complete`,
    { meta },
    { signal },
  );
  const result = res?.uploaded?.[0] ?? {};
  finished.set(fingerprint, result);
  return result;
}

/**
 * Send one batch: small files in one multipart request (`sendBatch`), big ones chunked one by one
 * after it. Live Photo pairs always stay in the batch (indexes in `livePhotoOf` are re-mapped).
 * Results come back in the order of `parts`.
 * shortcut: if a big file fails, the loop retries the whole batch and the small ones come back as
 * `duplicate` (the server's hash guard) — fine for counts, track per-file results if it matters.
 */
export async function uploadMixed<P>(o: {
  http: HttpClient;
  io: ChunkIO<P>;
  parts: P[];
  meta: (UploadMeta | null)[];
  sendBatch: (parts: P[], meta: (UploadMeta | null)[]) => Promise<UploadResult[]>;
  signal?: AbortSignal;
}): Promise<UploadResult[]> {
  const { parts, meta } = o;
  const paired = (i: number) => meta[i]?.livePhotoOf !== undefined || meta.some((m) => m?.livePhotoOf === i);
  const big = parts.map((p, i) => o.io.size(p) > CHUNKED_THRESHOLD && !paired(i));
  const small = parts.map((_, i) => i).filter((i) => !big[i]);
  const newIndex = new Map(small.map((i, k) => [i, k]));
  const results: UploadResult[] = new Array(parts.length).fill({});

  if (small.length) {
    const smallMeta = small.map((i) => {
      const m = meta[i] ?? null;
      return m?.livePhotoOf !== undefined ? { ...m, livePhotoOf: newIndex.get(m.livePhotoOf)! } : m;
    });
    const res = await o.sendBatch(
      small.map((i) => parts[i]),
      smallMeta,
    );
    small.forEach((i, k) => (results[i] = res[k] ?? {}));
  }
  for (const [i, isBig] of big.entries()) {
    if (isBig) results[i] = await uploadResumable(o.http, o.io, parts[i], meta[i] ?? null, o.signal);
  }
  return results;
}
