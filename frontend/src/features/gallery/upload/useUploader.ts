import { runUploadLoop, type UploadLoopProgress, type UploadMeta, type UploadProgress } from "@tng/shared";
import { create } from "zustand";

import { sendMedia } from "@/services/upload";

import { isMediaFile } from "./mediaFiles";

interface UploaderState {
  uploading: boolean;
  progress: UploadProgress | null;
  /** i18n key of the last error (null = none) + its count (`{{n}}`). */
  error: string | null;
  errorCount: number;
  /**
   * Upload `files` (non-photo / video files are skipped). `meta[i]` goes with `files[i]`.
   * One bad file or a flaky network doesn't stop the rest (retries, 429 pause, bad batch split).
   */
  upload: (files: File[], opts?: { meta?: (UploadMeta | null)[]; onDone?: () => void }) => Promise<UploadLoopProgress | null>;
}

type Job = { file: File; meta: UploadMeta | null };

/**
 * Một hàng upload cho cả trang Gallery: menu "Thêm ảnh" (file · thư mục) và kéo thả vào lưới dùng
 * chung 1 thanh tiến độ. Mỗi lúc chỉ 1 lượt — lượt sau bị bỏ qua.
 */
export const useUploader = create<UploaderState>((set, get) => ({
  uploading: false,
  progress: null,
  error: null,
  errorCount: 0,
  upload: async (files, opts) => {
    if (get().uploading) return null;
    const jobs: Job[] = files.map((file, i) => ({ file, meta: opts?.meta?.[i] ?? null })).filter((x) => isMediaFile(x.file));
    if (jobs.length === 0) {
      set({ error: files.length ? "gallery.upload.noMedia" : null, errorCount: 0 });
      return null;
    }
    set({ uploading: true, error: null, errorCount: 0, progress: { uploadedCount: 0, totalCount: jobs.length, currentBatchPercent: 0 } });
    try {
      const result = await runUploadLoop<Job, Job>({
        items: jobs,
        batchSize: 10,
        prepare: async (job) => job,
        send: (batch, _items, signal) =>
          sendMedia(
            batch.map((j) => j.file),
            batch.map((j) => j.meta),
            { signal },
          ),
        onProgress: (p) =>
          set({ progress: { uploadedCount: p.done + p.failed, totalCount: p.total, currentBatchPercent: 0 } }),
      });
      if (result.failed) set({ error: "gallery.upload.someFailed", errorCount: result.failed });
      return result;
    } finally {
      set({ uploading: false, progress: null });
      opts?.onDone?.();
    }
  },
}));
