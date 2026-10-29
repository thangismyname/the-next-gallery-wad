import { z } from "zod";
import { LINK_PERMISSIONS, MAX_MEDIA_PER_REQUEST, MEMBER_ROLES, SMART_MAX_TAGS } from "./albums.constants.js";

const uuid = z.string().uuid();
// User id của Better Auth là TEXT — không dùng .uuid().
const userId = z.string().min(1).max(64);
const name = z.string().trim().min(1).max(255);
const description = z.string().trim().max(2000);

// Album thông minh: theo tag nội dung (AND) hoặc theo câu search kết hợp.
export const smartRuleSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("tags"),
    tags: z.array(z.string().regex(/^[a-z_]{1,40}$/)).min(1).max(SMART_MAX_TAGS),
    minConfidence: z.number().min(0).max(1).nullable().default(null),
  }),
  z.object({
    type: z.literal("query"),
    query: z.string().trim().min(1).max(120),
  }),
]);

export const albumParamsSchema = z.object({ id: uuid });
export const memberParamsSchema = z.object({ id: uuid, userId });
export const linkParamsSchema = z.object({ id: uuid, linkId: uuid });
export const publicParamsSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/) });

export const createAlbumSchema = z.object({
  name,
  description: description.optional(),
  mediaIds: z.array(uuid).max(MAX_MEDIA_PER_REQUEST).default([]),
  smartRule: smartRuleSchema.optional(),
});

export const updateAlbumSchema = z
  .object({
    name: name.optional(),
    description: description.nullable().optional(),
    coverMediaId: uuid.nullable().optional(),
    smartRule: smartRuleSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Không có gì để cập nhật" });

export const mediaIdsBodySchema = z.object({
  mediaIds: z.array(uuid).min(1).max(MAX_MEDIA_PER_REQUEST),
});

export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(60),
  offset: z.coerce.number().int().min(0).default(0),
});

export const inviteMembersSchema = z.object({
  userIds: z.array(userId).min(1).max(50),
  role: z.enum(MEMBER_ROLES).default("viewer"),
});

export const updateMemberSchema = z.object({ role: z.enum(MEMBER_ROLES) });

export const respondInviteSchema = z.object({ accept: z.boolean() });

export const createLinkSchema = z.object({
  permission: z.enum(LINK_PERMISSIONS).default("view"),
  expiresInDays: z.number().int().min(1).max(365).nullable().default(null),
  maxViews: z.number().int().min(1).max(100000).nullable().default(null),
});

// Thứ tự mới của TOÀN BỘ ảnh trong album (kéo thả).
export const reorderSchema = z.object({
  mediaIds: z.array(uuid).min(1).max(10000),
});

export const containingParamsSchema = z.object({ mediaId: uuid });

// Album tự động: key = "<loại>-<giá trị>" (vd type-videos, tag-portrait,
// month-2026-10, event-202610291430, object-animal).
export const autoParamsSchema = z.object({
  key: z.string().regex(/^(type|tag|month|event|object)-[a-z0-9_-]{1,40}$/),
});
// Múi giờ IANA của client (vd Asia/Ho_Chi_Minh) — tháng / sự kiện theo giờ địa phương.
const tz = z.string().regex(/^[A-Za-z0-9_+\-/]{1,64}$/).optional();
export const autoQuerySchema = z.object({ tz });
export const autoPageQuerySchema = pageQuerySchema.extend({ tz });
export const saveAutoSchema = z.object({ name, tz });
