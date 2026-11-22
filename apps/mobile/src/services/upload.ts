import { uploadMixed, type ChunkIO, type UploadMeta, type UploadResult } from "@tng/shared";
import { File, Paths } from "expo-file-system";

import { mobileHttp } from "@/lib/http/mobile";

/** A local file to upload (image picker asset / camera capture). */
export interface UploadSource {
  uri: string;
  name: string;
  type: string;
  /** Importer metadata (Google Takeout…) — backend `media.schema.js::parseUploadMeta`. */
  meta?: UploadMeta;
}

/** A file part React Native's FormData streams from disk. */
export type RnPart = { uri: string; name: string; type: string };

const sizeOf = (uri: string) => new File(uri).size ?? 0;

/** RN files for the chunked upload: each chunk = bytes copied into a temp cache file (FormData needs a uri). */
const rnChunkIO: ChunkIO<RnPart> = {
  size: (p) => sizeOf(p.uri),
  name: (p) => p.name,
  type: (p) => p.type,
  fingerprint: (p) => `${p.uri}:${sizeOf(p.uri)}`,
  slice: async (p, start, end) => {
    const handle = new File(p.uri).open();
    try {
      handle.offset = start;
      const bytes = await handle.readBytes(end - start);
      const tmp = new File(Paths.cache, `upload-chunk-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
      tmp.write(bytes);
      return {
        body: { uri: tmp.uri, name: "chunk", type: "application/octet-stream" } as unknown as Blob,
        release: () => {
          try {
            tmp.delete();
          } catch {
            // already gone
          }
        },
      };
    } finally {
      handle.close();
    }
  },
};

/**
 * `POST /gallery/media` (multipart field `media`, ≤ 20 files per request — same endpoint as the web);
 * files over `CHUNKED_THRESHOLD` (photo or video) go in resumable 8 MiB chunks instead.
 * `meta[i]` goes with part i. Results in the order of `parts`.
 */
export function sendMediaParts(
  parts: RnPart[],
  meta: (UploadMeta | null)[],
  opts?: { onProgress?: (percent: number) => void; signal?: AbortSignal },
) {
  return uploadMixed({
    http: mobileHttp,
    io: rnChunkIO,
    parts,
    meta: parts.map((_, i) => meta[i] ?? null),
    signal: opts?.signal,
    sendBatch: async (batch, batchMeta) => {
      const form = new FormData();
      for (const part of batch) form.append("media", part as unknown as Blob);
      // Only sent when some file has meta.
      if (batchMeta.some(Boolean)) form.append("meta", JSON.stringify(batchMeta));
      const res = await mobileHttp.upload<{ uploaded?: UploadResult[] }>("/gallery/media", form, opts);
      return res?.uploaded ?? [];
    },
  });
}

/** Upload picker / camera files (see `sendMediaParts`). */
export async function uploadMediaFiles(
  sources: UploadSource[],
  opts?: { onProgress?: (percent: number) => void; signal?: AbortSignal },
) {
  const uploaded = await sendMediaParts(
    sources.map(({ uri, name, type }) => ({ uri, name, type })),
    sources.map((s) => s.meta ?? null),
    opts,
  );
  return { uploaded: uploaded as { id: string }[] };
}
