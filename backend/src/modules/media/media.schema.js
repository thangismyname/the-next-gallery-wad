import { TAG_ID_RE } from "../ai/tagging.constants.js";
import { z } from "zod";
import { SCOPE_PATTERN } from "./media.scope.js";
import { httpError } from "../../middleware/errorHandler.js";

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
  tag: z.string().regex(TAG_ID_RE),
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
// Múi giờ IANA của client — tìm theo ngày ("2026", "19/11") tính theo giờ địa phương như Thư viện.
const tz = z.string().regex(/^[A-Za-z0-9_+\-/]{1,64}$/).optional();

export const objectSearchQuerySchema = searchQuerySchema.extend({
  scope: z.string().regex(SCOPE_PATTERN).optional(),
  tz,
});

// `scope` = favorites | label:<id> | album:<id> (Spotlight chip); có scope thì
// `q` được để trống (liệt kê ảnh trong phạm vi).
export const mediaSearchQuerySchema = z
  .object({
    q: z.string().trim().max(120).default(""),
    mode: z.enum(["hybrid", "clip"]).default("hybrid"),
    scope: z.string().regex(SCOPE_PATTERN).optional(),
    tz,
  })
  .refine((v) => v.q.length > 0 || v.scope, { message: "Thiếu từ khoá" });

// Basic edit — công thức chỉnh ảnh. Khớp FE `features/editor/recipe.ts` (đổi cả 2).
// exposure theo EV (±3); các thông số còn lại −100…100, 0 = không chỉnh.
const slider = z.number().min(-100).max(100).default(0);
export const editRecipeSchema = z
  .object({
    v: z.literal(1),
    exposure: z.number().min(-3).max(3).default(0),
    contrast: slider,
    highlights: slider,
    shadows: slider,
    whites: slider,
    blacks: slider,
    temperature: slider,
    tint: slider,
    vibrance: slider,
    saturation: slider,
    vignette: slider,
  })
  .strict();

// multipart: field `recipe` là chuỗi JSON (+ file `image` = ảnh đã render).
export const saveEditBodySchema = z.object({
  recipe: z
    .string()
    .max(2000)
    .transform((s, ctx) => {
      try {
        return JSON.parse(s);
      } catch {
        ctx.addIssue({ code: "custom", message: "recipe không phải JSON" });
        return z.NEVER;
      }
    })
    .pipe(editRecipeSchema),
});

/**
 * Upload metadata — multipart text field `meta` = JSON array aligned with the `media` files
 * (index i ↔ file i). Used by importers (Google Takeout…): `takenAt` only fills in when the
 * file has no EXIF / video creation_time, `favorite` sets the heart, `albumIds` = own manual
 * albums to add the photo to (others are ignored), `bulk` = importer upload (AI on the slow lane,
 * a duplicate that sits in the Trash stays there), `importId` = import session to count it in
 * (`modules/imports`). Missing field = no meta.
 */
const uploadMetaItemSchema = z
  .object({
    takenAt: z.iso
      .datetime({ offset: true })
      .refine((v) => {
        const t = Date.parse(v);
        return t >= Date.UTC(1900, 0, 1) && t <= Date.now() + 86_400_000;
      }, "takenAt out of range")
      .optional(),
    favorite: z.boolean().optional(),
    albumIds: z.array(z.uuid()).max(50).optional(),
    bulk: z.boolean().optional(),
    importId: z.uuid().optional(),
    // Từ sidecar Takeout: mô tả → media.caption, geoData → latitude / longitude (chỉ lấp chỗ trống).
    description: z.string().trim().min(1).max(2000).optional(),
    location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).strict().optional(),
    // File này là video Live Photo của file thứ `livePhotoOf` (index trong CÙNG request, đứng trước).
    livePhotoOf: z.number().int().min(0).max(19).optional(),
  })
  .strict()
  .nullable();

/** → one entry (or null) per file; throws 400 INVALID_META on bad input. */
export function parseUploadMeta(raw, fileCount) {
  if (raw == null || raw === "") return [];
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    throw httpError(400, "INVALID_META", "meta must be a JSON array");
  }
  const result = z.array(uploadMetaItemSchema).max(fileCount).safeParse(json);
  if (!result.success) throw httpError(400, "INVALID_META", result.error.issues[0]?.message ?? "invalid meta");
  return result.data;
}

// Upload chia nhỏ (media.chunked.service.js) — fingerprint = client tự đặt (tên + size + ngày sửa…),
// cùng fingerprint = tiếp tục phiên cũ.
export const startChunkedSchema = z.object({
  name: z.string().trim().min(1).max(255),
  size: z.number().int().positive().max(8 * 1024 ** 3) /* = MAX_RESUMABLE_BYTES */,
  mimeType: z.string().max(100).default(""),
  fingerprint: z.string().min(1).max(500),
});

export const chunkParamsSchema = z.object({ id: z.string().regex(/^[0-9a-f]{32}$/) });

export const chunkQuerySchema = z.object({ offset: z.coerce.number().int().min(0) });

export const completeChunkedSchema = z.object({
  // 1 file → meta 1 phần tử, dùng lại đúng validate của upload thường (livePhotoOf không áp dụng).
  meta: z.unknown().optional().transform((m) => parseUploadMeta(m == null ? null : JSON.stringify([m]), 1)[0] ?? null),
});
