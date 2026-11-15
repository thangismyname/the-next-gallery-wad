import { mobileHttp } from "@/lib/http/mobile";

/** A local file to upload (image picker asset / camera capture). */
export interface UploadSource {
  uri: string;
  name: string;
  type: string;
}

/**
 * Upload files to `POST /gallery/media` (multipart field `media`, ≤ 20 files per
 * request — the same endpoint as the web). React Native's FormData takes
 * `{ uri, name, type }` and streams the file from disk.
 */
export function uploadMediaFiles(
  sources: UploadSource[],
  opts?: { onProgress?: (percent: number) => void; signal?: AbortSignal },
) {
  const form = new FormData();
  for (const source of sources) {
    form.append("media", { uri: source.uri, name: source.name, type: source.type } as unknown as Blob);
  }
  return mobileHttp.upload<{ uploaded?: { id: string }[] }>("/gallery/media", form, opts);
}
