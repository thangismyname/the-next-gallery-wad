import { z } from "zod";
import { LABEL_COLORS, MAX_MEDIA_PER_REQUEST } from "./labels.constants.js";

const uuid = z.string().uuid();
const name = z.string().trim().min(1).max(40);
const color = z.enum(LABEL_COLORS);

export const labelParamsSchema = z.object({ id: uuid });
export const mediaParamsSchema = z.object({ mediaId: uuid });

export const createLabelSchema = z.object({ name, color: color.default("slate") });

export const updateLabelSchema = z
  .object({ name: name.optional(), color: color.optional() })
  .refine((v) => Object.keys(v).length > 0, { message: "Không có gì để cập nhật" });

export const labelMediaSchema = z.object({
  mediaIds: z.array(uuid).min(1).max(MAX_MEDIA_PER_REQUEST),
});

// filter: all = có tim HOẶC có nhãn · favorites = chỉ có tim · <uuid> = 1 nhãn.
export const savedQuerySchema = z.object({
  filter: z.union([z.enum(["all", "favorites"]), uuid]).default("all"),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});
