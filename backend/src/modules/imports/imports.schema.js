import { z } from "zod";

/** Lý do một file không vào được thư viện (client phân loại). */
export const FAILURE_REASONS = ["badFile", "network", "unreadable"];
export const MAX_FAILURES = 500;

export const importParamsSchema = z.object({ id: z.uuid() });

export const createImportSchema = z.object({
  source: z.enum(["takeout"]),
  client: z.enum(["web", "mobile"]),
  // Số liệu lúc xem trước (media, videos, albums, duplicates, missingJson, skipped, existing).
  plan: z.record(z.string().max(32), z.number().int().min(0)).refine((p) => Object.keys(p).length <= 20, "too many keys"),
});

export const updateImportSchema = z
  .object({
    status: z.enum(["running", "done", "cancelled", "failed"]).optional(),
    skippedExisting: z.number().int().min(0).optional(),
    // Danh sách đầy đủ hiện tại (thay cái cũ), đã cắt ≤ 500 phía client.
    failures: z
      .array(z.object({ path: z.string().min(1).max(1024), reason: z.enum(FAILURE_REASONS) }))
      .max(MAX_FAILURES)
      .optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "empty update");

/** Ảnh nào user đã có (tên + dung lượng) — trước khi upload. */
export const importCheckSchema = z.object({
  items: z
    .array(z.object({ name: z.string().min(1).max(255), size: z.number().int().min(0) }))
    .min(1)
    .max(1000),
});
