import { HttpError } from "@tng/shared";
import { create } from "zustand";

import { queryClient } from "@/lib/queryClient";
import { uploadMediaFiles, type UploadSource } from "@/services/upload";

import { galleryKeys } from "../gallery/useGalleryMedia";

/** Requests in flight at the same time. */
const CONCURRENCY = 2;
/**
 * Files per request: the backend allows 120 upload requests / min, so one file per
 * request would hit 429 after 120 photos. A batch that fails with 4xx is split
 * into single files so only the bad file ends up failed.
 */
const BATCH = 8;
/** Wait before re-trying after 429 (rate limit). */
const RATE_LIMIT_WAIT = 20_000;
/** The finished queue disappears after this long (ms). */
const CLEAR_DELAY = 2500;

export type UploadStatus = "queued" | "uploading" | "done" | "error";

export interface UploadItem extends UploadSource {
  id: string;
  /** Local preview (photos: the file itself; videos: none). */
  preview: string | null;
  status: UploadStatus;
  /** 0–100 while uploading. */
  progress: number;
  /** i18n key of the error (bad file vs network). */
  error?: string;
}

interface UploadQueueState {
  items: UploadItem[];
  /** Returns the new items' ids (to follow one, e.g. the camera's last shot). */
  enqueue: (sources: (UploadSource & { preview?: string | null })[]) => string[];
  /** Re-queue every failed item. */
  retryFailed: () => void;
  /** Drop finished + failed items (hide the status pill). */
  dismiss: () => void;
}

let seq = 0;
const controllers = new Map<string, AbortController>();
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Global upload queue (survives tab switches; not persisted across app restarts).
 * Files go in batches of `BATCH`, up to `CONCURRENCY` requests at once; the gallery refetches shortly after files
 * land (debounced), so new photos show at the top of the grid. 429 → pause and
 * resume; a 4xx (e.g. unsupported file) fails that file; network errors can be
 * retried from the status pill.
 */
export const useUploadQueue = create<UploadQueueState>((set, get) => {
  const refreshGallery = () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => void queryClient.invalidateQueries({ queryKey: galleryKeys.all }), 800);
  };

  const scheduleClear = () => {
    if (clearTimer) clearTimeout(clearTimer);
    const { items } = get();
    if (items.length && items.every((it) => it.status === "done")) {
      clearTimer = setTimeout(() => {
        if (get().items.every((it) => it.status === "done")) set({ items: [] });
      }, CLEAR_DELAY);
    }
  };

  /** Items that must go alone (their batch was rejected → find the bad file). */
  const single = new Set<string>();
  let pausedUntil = 0;

  const start = async (batch: UploadItem[]) => {
    const controller = new AbortController();
    const ids = new Set(batch.map((it) => it.id));
    for (const id of ids) controllers.set(id, controller);
    set((s) => ({
      items: s.items.map((it) => (ids.has(it.id) ? { ...it, status: "uploading", progress: 0, error: undefined } : it)),
    }));
    const patchBatch = (change: Partial<UploadItem>) =>
      set((s) => ({ items: s.items.map((it) => (ids.has(it.id) ? { ...it, ...change } : it)) }));
    try {
      await uploadMediaFiles(batch, {
        signal: controller.signal,
        onProgress: (progress) => patchBatch({ progress }),
      });
      patchBatch({ status: "done", progress: 100 });
      refreshGallery();
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 0;
      if (status === 429) {
        // Rate limited: back to the queue, resume later.
        pausedUntil = Date.now() + RATE_LIMIT_WAIT;
        patchBatch({ status: "queued", progress: 0 });
        setTimeout(pump, RATE_LIMIT_WAIT);
      } else if (status >= 400 && status < 500 && batch.length > 1) {
        // One bad file rejects the whole request → retry each file alone.
        for (const id of ids) single.add(id);
        patchBatch({ status: "queued", progress: 0 });
      } else {
        patchBatch({ status: "error", error: status >= 400 && status < 500 ? "upload.badFile" : "upload.networkError" });
      }
    } finally {
      for (const id of ids) controllers.delete(id);
      pump();
      scheduleClear();
    }
  };

  const pump = () => {
    if (Date.now() < pausedUntil) return;
    const { items } = get();
    const running = new Set(items.filter((it) => it.status === "uploading").map((it) => controllers.get(it.id)));
    let slots = CONCURRENCY - running.size;
    const queued = items.filter((it) => it.status === "queued");
    while (slots > 0 && queued.length) {
      const batch = single.has(queued[0].id) ? queued.splice(0, 1) : [];
      if (!batch.length) {
        while (batch.length < BATCH && queued.length && !single.has(queued[0].id)) batch.push(queued.shift()!);
      }
      slots--;
      void start(batch);
    }
  };

  return {
    items: [],
    enqueue: (sources) => {
      if (!sources.length) return [];
      if (clearTimer) clearTimeout(clearTimer);
      const ids = sources.map(() => `u${++seq}`);
      set((s) => ({
        // A new batch replaces a fully finished one.
        items: [
          ...s.items.filter((it) => it.status !== "done" || s.items.some((x) => x.status !== "done")),
          ...sources.map((src, i) => ({
            id: ids[i],
            uri: src.uri,
            name: src.name,
            type: src.type,
            meta: src.meta,
            preview: src.preview ?? null,
            status: "queued" as const,
            progress: 0,
          })),
        ],
      }));
      pump();
      return ids;
    },
    retryFailed: () => {
      set((s) => ({
        items: s.items.map((it) => (it.status === "error" ? { ...it, status: "queued", progress: 0, error: undefined } : it)),
      }));
      pump();
    },
    dismiss: () => {
      set((s) => ({ items: s.items.filter((it) => it.status === "uploading" || it.status === "queued") }));
    },
  };
});

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
};

/** Name + MIME for a local file (picker / camera often omit one of them). */
export function describeFile(uri: string, opts: { name?: string | null; type?: string | null; video?: boolean }) {
  const fromUri = decodeURIComponent(uri.split("?")[0].split("/").pop() ?? "");
  const name = opts.name || fromUri || `${Date.now()}.${opts.video ? "mp4" : "jpg"}`;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const type = opts.type || EXT_MIME[ext] || (opts.video ? "video/mp4" : "image/jpeg");
  return { name, type };
}
