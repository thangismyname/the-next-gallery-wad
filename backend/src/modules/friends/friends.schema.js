import { z } from "zod";

// "user".id do Better Auth sinh là chuỗi ngẫu nhiên (TEXT), không phải UUID.
const userId = z.string().min(1).max(64);

/** Gửi lời mời: theo id (kết quả tìm kiếm) — `query` (email / tên chính xác) giữ cho client cũ. */
export const addFriendSchema = z
  .object({
    userId: userId.optional(),
    query: z.string().trim().min(1).max(320).optional(),
  })
  .refine((v) => v.userId || v.query, { message: "Thiếu người nhận" });

export const searchUserQuerySchema = z.object({
  q: z.string().trim().min(1).max(320),
});

export const requestParamsSchema = z.object({
  requestId: z.string().uuid("ID không hợp lệ"),
});

export const deleteFriendSchema = z.object({
  friendId: userId,
});

export const claimInviteSchema = z.object({
  token: z.string().min(1, "Thiếu token").max(512),
});
