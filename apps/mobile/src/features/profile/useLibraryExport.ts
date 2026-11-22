import { File, Paths, type DownloadTask } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useRef, useState } from "react";

import { authClient } from "@/lib/authClient";
import { API_URL } from "@/lib/config";

export class NotEnoughSpaceError extends Error {}

const exportFile = () => new File(Paths.cache, "the-next-gallery-export.zip");

/** First bytes "PK" = a zip (an error response would be saved as JSON otherwise). */
async function isZip(file: File) {
  const handle = file.open();
  try {
    const sig = await handle.readBytes(2);
    return sig[0] === 0x50 && sig[1] === 0x4b;
  } finally {
    handle.close();
  }
}

/**
 * Whole library → zip in Google Takeout layout (backend `GET /gallery/media/export`, like web
 * Quick send) → app cache → system share sheet (Save to Files · AirDrop · Drive…).
 * `bytes` = downloaded so far (no total: the zip is streamed), null when idle; `toggle` while
 * running = cancel.
 */
export function useLibraryExport() {
  const [bytes, setBytes] = useState<number | null>(null);
  const task = useRef<DownloadTask | null>(null);

  /** `needBytes` ≈ library size (the export is a little bigger: album copies). */
  const toggle = async (needBytes: number) => {
    if (task.current) {
      task.current.cancel();
      return;
    }
    const file = exportFile();
    // shortcut: last export stays in cache until the next one / the OS purges it (Android's share sheet may still be reading it).
    if (file.exists) file.delete();
    if (Paths.availableDiskSpace < needBytes) throw new NotEnoughSpaceError();
    const cookie = await authClient.getCookie();
    const current = File.createDownloadTask(`${API_URL}/gallery/media/export`, file, {
      headers: cookie ? { Cookie: cookie } : {},
      onProgress: ({ bytesWritten }) => setBytes(bytesWritten),
    });
    task.current = current;
    setBytes(0);
    try {
      const out = await current.downloadAsync();
      if (!out) return;
      if (!(await isZip(out))) throw new Error("export failed");
      await Sharing.shareAsync(out.uri, { mimeType: "application/zip", UTI: "public.zip-archive" });
    } catch (err) {
      if (current.state === "cancelled") return;
      throw err;
    } finally {
      task.current = null;
      setBytes(null);
    }
  };

  return { bytes, toggle };
}
