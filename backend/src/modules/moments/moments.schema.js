import { z } from "zod";

export const listFeedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(40),
  offset: z.coerce.number().int().min(0).default(0),
});

export const createMomentSchema = z
  .object({
    template: z.enum(["single", "duo_square", "trio_wide"]).default("single"),
    mediaId: z.string().uuid("mediaId không hợp lệ").nullable().optional(),
    mediaIds: z.array(z.string().uuid("mediaId không hợp lệ")).max(3).optional(),
    collaboratorIds: z.array(z.string().min(1, "ID bạn bè không hợp lệ").max(64)).max(2).optional(),
    caption: z.string().max(280).optional(),
    visibility: z.enum(["circle", "public", "private"]).default("circle"),
  })
  .refine((data) => data.template === "single" ? data.mediaId : true, {
    message: "Thiếu mediaId cho template single",
    path: ["mediaId"],
  });

// PUT /:momentId — chỉ chỉnh sửa được moment ghép nhiều ảnh (2-3 slot).
export const updateMomentSchema = createMomentSchema.refine(
  (data) => data.template !== "single",
  {
    message: "Chỉ có thể chỉnh sửa moment ghép nhiều ảnh (2-3 slot)",
    path: ["template"],
  },
);

export const fillSlotsSchema = z.object({
  mediaIds: z.array(z.string().uuid("mediaId không hợp lệ")).min(1).max(3),
});

export const momentParamsSchema = z.object({
  momentId: z.string().uuid("momentId không hợp lệ"),
});

// React: bắt buộc có emoji.
export const createReactionSchema = z.object({
  emoji: z.string().min(1).max(10),
});

// Meme: template + dòng chữ (memegen.link) + caption tùy chọn.
export const memeListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const createMemeSchema = z.object({
  templateId: z.string().trim().min(1).max(64),
  // Chữ KHÔNG bắt buộc — bỏ trống thì dùng meme gốc của template.
  lines: z.array(z.string().trim().max(80)).max(5).default([]),
  caption: z.string().trim().max(280).optional(),
});

export const memeParamsSchema = z.object({
  momentId: z.string().uuid("momentId không hợp lệ"),
  memeId: z.string().uuid("memeId không hợp lệ"),
});
