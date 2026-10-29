import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import * as profileService from "./profile.service.js";
import { avatarParamsSchema } from "./profile.schema.js";
import {
  createMediaStream,
  getThumbnailInfo,
} from "../media/media.stream.service.js";

// Thông tin tài khoản (tên, ảnh đại diện, mật khẩu) do Better Auth xử lý trực
// tiếp ở FE (authClient.updateUser / changePassword) — module này chỉ thêm
// số liệu thống kê cho trang hồ sơ / cài đặt.
const router = Router();

router.get("/stats", requireAuth, async (req, res, next) => {
  try {
    const data = await profileService.getProfileStats(req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get("/storage", requireAuth, async (req, res, next) => {
  try {
    const data = await profileService.getStorageBreakdown(req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Ảnh đại diện (công khai — bạn bè / moment đều thấy): bản 400px của ảnh
// đang làm avatar. Đổi avatar → URL đổi theo mediaId nên cache được.
router.get("/avatar/:mediaId", validate(avatarParamsSchema, "params"), async (req, res, next) => {
  try {
    const { mediaId } = req.params;
    const info = (await profileService.isCurrentAvatar(mediaId))
      ? await getThumbnailInfo(mediaId, "med")
      : null;
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
    stream.on("error", () => !res.headersSent && res.status(500).end());
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
});

export default router;
