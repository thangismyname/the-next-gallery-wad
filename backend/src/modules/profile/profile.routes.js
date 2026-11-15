import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import * as profileService from "./profile.service.js";
import { avatarParamsSchema } from "./profile.schema.js";
import {
  createMediaStream,
  getThumbnailInfo,
} from "../media/media.stream.service.js";
import { asyncHandler, respond } from "../../middleware/asyncHandler.js";
import sharp from "sharp";
import { AVATAR_SIZE, cropBox } from "./profile.avatar.js";

// Thông tin tài khoản (tên, ảnh đại diện, mật khẩu) do Better Auth xử lý trực
// tiếp ở FE (authClient.updateUser / changePassword) — module này chỉ thêm
// số liệu thống kê cho trang hồ sơ / cài đặt.
const router = Router();

router.get("/stats", requireAuth, respond((req) => profileService.getProfileStats(req.user.id)));

router.get("/storage", requireAuth, respond((req) => profileService.getStorageBreakdown(req.user.id)));

// Ảnh đại diện (công khai — bạn bè / moment đều thấy). Không crop: bản `med` 400px.
// Có crop (lưu trong user.image, không lấy từ request): cắt từ bản `display` ≤ 2048px
// rồi resize vuông AVATAR_SIZE. Đổi avatar / crop → URL đổi nên cache được.
router.get("/avatar/:mediaId", validate(avatarParamsSchema, "params"), asyncHandler(async (req, res) => {
  const { mediaId } = req.params;
  const avatar = await profileService.getCurrentAvatar(mediaId);
  const info = avatar ? await getThumbnailInfo(mediaId, avatar.crop ? "display" : "med") : null;
  if (!info) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Không có ảnh đại diện" },
    });
  }
  res.setHeader("Content-Type", "image/webp");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  const stream = await createMediaStream(info.bucket, info.objectToStream);
  if (!avatar.crop) {
    stream.on("error", () => !res.headersSent && res.status(500).end());
    return stream.pipe(res);
  }
  const source = sharp(await streamToBuffer(stream));
  const { width = 0, height = 0 } = await source.metadata();
  const image = await source
    .extract(cropBox(avatar.crop, width, height))
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover" })
    .webp({ quality: 85 })
    .toBuffer();
  res.end(image);
}));

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default router;
