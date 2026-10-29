import { z } from "zod";
import { SCOPE_PATTERN } from "./media.scope.js";

export const listMediaQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(40),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z
    .enum(["newest", "oldest", "name_asc", "name_desc"])
    .optional()
    .default("newest"),
  type: z.enum(["photo", "video"]).optional(),
});

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(120),
});

// YOLO chạy chậm hơn CLIP → lô nhỏ hơn.
export const detectBackfillSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const embedBackfillSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const listAlbumsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(40),
});

// Trang Yêu thích hiển thị tất cả ảnh yêu thích — cho phép limit lớn
export const listFavoritesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

// Thùng rác thường ít mục — cho phép lấy với limit lớn hơn
export const listTrashQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export const mediaIdsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

// POST /lookup — lấy media theo danh sách id (ShareDialog, chọn nhiều ảnh cũ).
export const lookupMediaSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(1000),
});

export const favoriteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  favorite: z.boolean(),
});

// DINOv3 nhẹ (ViT-S/16) nhưng vẫn chạy mỗi ảnh 1 request → lô vừa.
export const similarBackfillSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const mediaIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const similarQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

// Gắn tag chỉ chạy model nhỏ trên vector đã có → lô lớn (ảnh thiếu embedding
// thì chậm hơn vì phải embed trước).
export const tagBackfillSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const tagParamsSchema = z.object({
  tag: z.string().regex(/^[a-z_]{1,40}$/),
});

// minConfidence bỏ trống → dùng ngưỡng riêng của tag.
export const tagMediaQuerySchema = z.object({
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(60),
  offset: z.coerce.number().int().min(0).default(0),
});

// Spotlight tìm ảnh: thêm `mode` để so sánh search kết hợp với CLIP thuần.
// Tải zip: form POST `ids=a,b,c` (≤ 1000 ảnh).
export const zipDownloadSchema = z.object({
  ids: z
    .string()
    .transform((s) => [...new Set(s.split(",").map((x) => x.trim()).filter(Boolean))])
    .pipe(z.array(z.string().uuid()).min(1).max(1000)),
});

// Nhóm "Vật thể" của Spotlight — cũng lọc được theo phạm vi.
export const objectSearchQuerySchema = searchQuerySchema.extend({
  scope: z.string().regex(SCOPE_PATTERN).optional(),
});

// `scope` = favorites | label:<id> | album:<id> (Spotlight chip); có scope thì
// `q` được để trống (liệt kê ảnh trong phạm vi).
export const mediaSearchQuerySchema = z
  .object({
    q: z.string().trim().max(120).default(""),
    mode: z.enum(["hybrid", "clip"]).default("hybrid"),
    scope: z.string().regex(SCOPE_PATTERN).optional(),
  })
  .refine((v) => v.q.length > 0 || v.scope, { message: "Thiếu từ khoá" });
