import { z } from "zod";

export const createSessionSchema = z.object({
  mediaIds: z.array(z.string().uuid()).min(1, "Cần ít nhất 1 media"),
});

export const sessionParamsSchema = z.object({
  id: z.string().uuid("ID phiên không hợp lệ"),
});

export const shareToFriendsSchema = z.object({
  mediaIds: z
    .array(z.string().uuid("mediaId không hợp lệ"))
    .min(1, "Chưa chọn ảnh nào")
    .max(1000),
  // "user".id là TEXT (Better Auth), không phải UUID.
  friendIds: z
    .array(z.string().min(1).max(64))
    .min(1, "Chọn ít nhất 1 người nhận")
    .max(50),
});
