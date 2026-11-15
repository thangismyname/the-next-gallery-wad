import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { momentsReadLimit, memeWriteLimit } from "../../middleware/rateLimit.js";
import {
  fetchMemeTemplates,
  listMomentMemes,
  createMomentMeme,
  deleteMomentMeme,
  toggleMemeReaction,
  getMemeImageInfo,
  createMemeStream,
  verifyMemeSignature,
} from "./moments.meme.service.js";
import { notifyMomentParticipants } from "./moments.notify.js";
import { MOMENT_EVENTS } from "./moments.events.js";
import { canViewMoment } from "./moments.query.service.js";
import { auth } from "../../lib/auth.js";
import {
  momentParamsSchema,
  memeListQuerySchema,
  createMemeSchema,
  memeParamsSchema,
} from "./moments.schema.js";
import { asyncHandler, respond } from "../../middleware/asyncHandler.js";
import { logger } from "../../lib/logger.js";

/** Meme trên mặt sau thẻ moment (memegen.link template + chữ, ❤️). Gắn vào moments.routes.js. */
const router = Router();

const MEME_TYPE_BY_EXT = {
  jpg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

// ── Memes (mặt sau thẻ moment khi lật) ──────────────────────────────

// GET /api/moments/memes/templates — danh sách template meme từ memegen.link.
// Phải đặt TRƯỚC GET /:momentId/memes để không bị khớp momentId="memes".
router.get("/memes/templates", requireAuth, momentsReadLimit, asyncHandler(async (req, res) => {
  const items = await fetchMemeTemplates();
  res.json({ success: true, data: { items } });
}));

// GET /api/moments/:momentId/memes — list meme của moment (mới → cũ, phân trang).
router.get(
  "/:momentId/memes",
  requireAuth,
  momentsReadLimit,
  validate(momentParamsSchema, "params"),
  validate(memeListQuerySchema, "query"),
  respond((req) => listMomentMemes(req.user.id, req.params.momentId, { limit: req.query.limit, offset: req.query.offset })),
);

// GET /api/moments/:momentId/memes/:memeId/image — stream ảnh meme (P2.2).
// Không requireAuth: ảnh nằm trong thẻ <img> cross-origin ở dev, nên URL API
// trả về đã ký sẵn (`exp`+`sig`). Không có chữ ký hợp lệ → mới kiểm session +
// quyền xem moment (dùng cho fetch có cookie).
router.get(
  "/:momentId/memes/:memeId/image",
  momentsReadLimit,
  validate(memeParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const { momentId, memeId } = req.params;
    const signed = verifyMemeSignature(momentId, memeId, req.query);
    if (!signed) {
      const session = await auth.api
        .getSession({ headers: req.headers })
        .catch(() => null);
      if (!session || !(await canViewMoment(session.user.id, momentId))) {
        return res.status(403).json({
          success: false,
          error: {
            code: "MEME_FORBIDDEN",
            message: "Không có quyền xem ảnh meme",
          },
        });
      }
    }

    const info = await getMemeImageInfo(momentId, memeId);
    if (!info) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Không tìm thấy ảnh meme" },
      });
    }

    const exp = Number(req.query.exp);
    const maxAge = signed ? Math.max(0, exp - Math.floor(Date.now() / 1000)) : 300;
    const etag = `W/"meme-${memeId}"`;
    if (req.headers["if-none-match"] === etag) return res.status(304).end();

    res.setHeader(
      "Content-Type",
      MEME_TYPE_BY_EXT[info.ext] || "application/octet-stream",
    );
    res.setHeader(
      "Cache-Control",
      signed
        ? `public, max-age=${maxAge}, immutable`
        : "private, max-age=300",
    );
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("ETag", etag);

    const stream = await createMemeStream(info.bucket, info.objectName);
    stream.on("error", (err) => {
      logger.error({ err }, `Lỗi stream meme ${info.objectName}`);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: { code: "STREAM_ERROR", message: "Stream error" },
        });
      } else {
        res.destroy(err);
      }
    });
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  }),
);

// POST /api/moments/:momentId/memes — thả meme (template + dòng chữ + caption).
router.post(
  "/:momentId/memes",
  requireAuth,
  memeWriteLimit,
  validate(momentParamsSchema, "params"),
  validate(createMemeSchema),
  asyncHandler(async (req, res) => {
    const meme = await createMomentMeme(
      req.user.id,
      req.params.momentId,
      req.body,
    );

    // WS: báo cho owner + người trong collab để cập nhật realtime
    await notifyMomentParticipants(
      req.params.momentId,
      MOMENT_EVENTS.MEME_ADDED,
      { momentId: req.params.momentId, meme },
    );

    res.status(201).json({ success: true, data: meme });
  }),
);

// DELETE /api/moments/:momentId/memes/:memeId — xóa meme của chính mình.
router.delete(
  "/:momentId/memes/:memeId",
  requireAuth,
  memeWriteLimit,
  validate(memeParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const { removed } = await deleteMomentMeme(
      req.user.id,
      req.params.memeId,
      req.params.momentId,
    );
    if (!removed) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Không tìm thấy meme" },
      });
    }

    await notifyMomentParticipants(
      req.params.momentId,
      MOMENT_EVENTS.MEME_REMOVED,
      { momentId: req.params.momentId, memeId: req.params.memeId },
    );

    res.json({ success: true, data: { removed: true } });
  }),
);

// POST /api/moments/:momentId/memes/:memeId/react — tim (❤️) 1 meme (toggle:
// đã tim thì bỏ tim). Trả trạng thái mới để FE cập nhật optimistic.
router.post(
  "/:momentId/memes/:memeId/react",
  requireAuth,
  memeWriteLimit,
  validate(memeParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const state = await toggleMemeReaction(
      req.user.id,
      req.params.memeId,
    );

    // WS: báo cho các thành viên còn lại (người hành động tự cập nhật)
    await notifyMomentParticipants(
      req.params.momentId,
      MOMENT_EVENTS.MEME_REACTED,
      {
        momentId: req.params.momentId,
        memeId: req.params.memeId,
        myReact: state.myReact,
        reactCount: state.reactCount,
      },
      { exceptUserId: req.user.id },
    );

    res.json({ success: true, data: state });
  }),
);

export default router;
