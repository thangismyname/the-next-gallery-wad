import { z } from "zod";

// POST /api/developer/request — lời nhắn tùy chọn; chuỗi rỗng coi như không có.
export const requestDeveloperSchema = z.object({
  message: z
    .string()
    .trim()
    .max(1000)
    .nullish()
    .transform((value) => (value ? value : null)),
});

// GET /api/admin/developer-requests?status=
export const listDeveloperRequestsQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
});

export const reviewParamsSchema = z.object({
  id: z.string().uuid("ID yêu cầu không hợp lệ"),
});

export const reviewDeveloperRequestSchema = z.object({
  approve: z.boolean(),
});
