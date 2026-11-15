import { z } from "zod";
import { MAX_FILES, MAX_RECIPIENTS, MAX_THUMB_CHARS } from "./transfers.constants.js";

const userId = z.string().min(1).max(64);

// JWK công khai ECDH P-256 — chỉ giữ các trường cần thiết.
const publicJwk = z.object({
  kty: z.literal("EC"),
  crv: z.literal("P-256"),
  x: z.string().min(1).max(64),
  y: z.string().min(1).max(64),
});

// Khoá file AES đã bọc bằng ECDH (khoá tạm của người gửi + khoá thiết bị người nhận).
const wrappedKey = z.object({
  deviceId: z.string().min(1).max(64),
  epk: publicJwk,
  iv: z.string().min(1).max(32),
  ct: z.string().min(1).max(128),
});

const fileSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    size: z.number().int().min(0),
    mime: z.string().max(100).default("application/octet-stream"),
    mediaId: z.string().uuid().optional(),
    thumb: z.string().max(MAX_THUMB_CHARS).optional(),
  });

export const createTransferSchema = z
  .object({
    kind: z.enum(["link", "direct"]),
    files: z.array(fileSchema).min(1).max(MAX_FILES),
    recipients: z
      .array(
        z.object({
          userId,
          wrappedKeys: z.array(wrappedKey).max(10).default([]),
        }),
      )
      .max(MAX_RECIPIENTS)
      .default([]),
    maxReceivers: z.number().int().min(1).max(MAX_RECIPIENTS).nullable().default(null),
  })
  .refine((v) => v.kind === "link" || v.recipients.length > 0, {
    message: "Chọn ít nhất 1 người nhận",
    path: ["recipients"],
  });

export const transferParamsSchema = z.object({ id: z.string().uuid() });
export const fileParamsSchema = z.object({
  id: z.string().uuid(),
  fileId: z.string().uuid(),
});
export const partParamsSchema = fileParamsSchema.extend({
  part: z.coerce.number().int().min(0).max(100_000),
});

export const resolveCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6}$/, "Mã gồm 6 ký tự"),
});

export const deviceKeySchema = z.object({
  deviceId: z.string().min(8).max(64),
  publicKey: publicJwk,
});

export const deviceKeysQuerySchema = z.object({
  userIds: z
    .string()
    .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(userId).min(1).max(MAX_RECIPIENTS)),
});
