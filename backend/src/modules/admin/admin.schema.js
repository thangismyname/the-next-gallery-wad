import { z } from "zod";

// "user".id do Better Auth sinh là chuỗi ngẫu nhiên (TEXT), không phải UUID.
export const userParamsSchema = z.object({
  userId: z.string().min(1, "ID người dùng không hợp lệ").max(64),
});

export const listUsersQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  role: z.enum(["user", "admin"]).optional(),
  status: z.enum(["active", "banned"]).optional(),
  sort: z.enum(["createdAt", "name", "mediaCount", "storage", "lastActive"]).default("createdAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
