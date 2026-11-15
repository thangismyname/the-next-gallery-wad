import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { publicLimit } from "../../middleware/rateLimit.js";
import { getPublicAlbum } from "./albums.links.service.js";
import { pageQuerySchema, publicParamsSchema } from "./albums.schema.js";
import { respond } from "../../middleware/asyncHandler.js";

// Không cần đăng nhập — quyền = biết token (share_links). Ảnh / thumbnail stream
// qua /api/gallery/media/:id/... vốn đã công khai theo id.
const router = Router();

router.get(
  "/albums/:token",
  publicLimit,
  validate(publicParamsSchema, "params"),
  validate(pageQuerySchema, "query"),
  respond((req) => getPublicAlbum(req.params.token, req.query)),
);

export default router;
