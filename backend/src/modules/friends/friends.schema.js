import { z } from "zod";

export const addFriendSchema = z.object({
  query: z.string().min(1).max(320),
});

export const searchUserQuerySchema = z.object({
  q: z.string().min(1).max(320),
});

export const requestParamsSchema = z.object({
  requestId: z.string().uuid("ID không hợp lệ"),
});

// "user".id do Better Auth sinh là chuỗi ngẫu nhiên (TEXT), không phải UUID.
export const deleteFriendSchema = z.object({
  friendId: z.string().min(1, "ID không hợp lệ").max(64),
});

export const claimInviteSchema = z.object({
  token: z.string().min(1, "Thiếu token"),
});
