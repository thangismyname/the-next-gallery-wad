import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import {
  listMomentsFeed,
  listMomentInvitations,
} from "./moments.feed.service.js";
import {
  createMoment,
  updateDraftMoment,
  fillMomentSlots,
  deleteMoment,
  leaveMoment,
} from "./moments.collab.service.js";
import { createReaction, deleteReaction } from "./moments.reaction.service.js";
import {
  fetchMemeTemplates,
  listMomentMemes,
  createMomentMeme,
  deleteMomentMeme,
  toggleMemeReaction,
} from "./moments.meme.service.js";
import {
  notifyUsers,
  notifyMomentParticipants,
  notifyCollabInvite,
} from "./moments.notify.js";
import {
  listFeedQuerySchema,
  createMomentSchema,
  updateMomentSchema,
  fillSlotsSchema,
  momentParamsSchema,
  createReactionSchema,
  memeListQuerySchema,
  createMemeSchema,
  memeParamsSchema,
} from "./moments.schema.js";

const router = Router();

// ---- Routes ----

// GET /api/moments — feed moments của mình + bạn bè, theo thời gian mới → cũ
// (chỉ moment HOÀN CHỈNH — draft collab chưa đủ slot không hiện ở đây)
router.get("/", requireAuth, validate(listFeedQuerySchema, "query"), async (req, res, next) => {
  try {
    const data = await listMomentsFeed(req.user.id, {
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// GET /api/moments/invitations — draft moment collab tôi cần điền / đang chờ bạn.
router.get("/invitations", requireAuth, async (req, res, next) => {
  try {
    const items = await listMomentInvitations(req.user.id);
    res.json({ success: true, data: { items } });
  } catch (error) {
    next(error);
  }
});

// ── Memes (mặt sau thẻ moment khi lật) ──────────────────────────────

// GET /api/moments/memes/templates — danh sách template meme từ memegen.link.
// Phải đặt TRƯỚC GET /:momentId/memes để không bị khớp momentId="memes".
router.get("/memes/templates", requireAuth, async (req, res, next) => {
  try {
    const items = await fetchMemeTemplates();
    res.json({ success: true, data: { items } });
  } catch (error) {
    next(error);
  }
});

// GET /api/moments/:momentId/memes — list meme của moment (mới → cũ, phân trang).
router.get(
  "/:momentId/memes",
  requireAuth,
  validate(momentParamsSchema, "params"),
  validate(memeListQuerySchema, "query"),
  async (req, res, next) => {
    try {
      const data = await listMomentMemes(
        req.user.id,
        req.params.momentId,
        { limit: req.query.limit, offset: req.query.offset },
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/moments/:momentId/memes — thả meme (template + dòng chữ + caption).
router.post(
  "/:momentId/memes",
  requireAuth,
  validate(momentParamsSchema, "params"),
  validate(createMemeSchema),
  async (req, res, next) => {
    try {
      const meme = await createMomentMeme(
        req.user.id,
        req.params.momentId,
        req.body,
      );

      // WS: báo cho owner + người trong collab để cập nhật realtime
      await notifyMomentParticipants(req.params.momentId, "moment:meme-added", {
        momentId: req.params.momentId,
        meme,
      });

      res.status(201).json({ success: true, data: meme });
    } catch (error) {
      next(error);
    }
  },
);

// DELETE /api/moments/:momentId/memes/:memeId — xóa meme của chính mình.
router.delete(
  "/:momentId/memes/:memeId",
  requireAuth,
  validate(memeParamsSchema, "params"),
  async (req, res, next) => {
    try {
      const removed = await deleteMomentMeme(
        req.user.id,
        req.params.memeId,
      );
      if (!removed) {
        return res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Không tìm thấy meme" },
        });
      }

      await notifyMomentParticipants(req.params.momentId, "moment:meme-removed", {
        momentId: req.params.momentId,
        memeId: req.params.memeId,
      });

      res.json({ success: true, data: { removed: true } });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/moments/:momentId/memes/:memeId/react — tim (❤️) 1 meme (toggle:
// đã tim thì bỏ tim). Trả trạng thái mới để FE cập nhật optimistic.
router.post(
  "/:momentId/memes/:memeId/react",
  requireAuth,
  validate(memeParamsSchema, "params"),
  async (req, res, next) => {
    try {
      const state = await toggleMemeReaction(
        req.user.id,
        req.params.memeId,
      );

      // WS: báo cho các thành viên còn lại (người hành động tự cập nhật)
      await notifyMomentParticipants(
        req.params.momentId,
        "moment:meme-reacted",
        {
          momentId: req.params.momentId,
          memeId: req.params.memeId,
          myReact: state.myReact,
          reactCount: state.reactCount,
        },
        { exceptUserId: req.user.id },
      );

      res.json({ success: true, data: state });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/moments — đăng moment từ ảnh/video đã có trong gallery.
// single: mediaId. duo_square/trio_wide: mediaIds (self-fill đủ slot) hoặc
// mediaIds (1..slotCount-1 ảnh của bạn) + collaboratorIds điền phần slot còn lại.
router.post("/", requireAuth, validate(createMomentSchema), async (req, res, next) => {
  try {
    const moment = await createMoment(req.user.id, req.body);

    // WS: mời bạn bè điền ảnh vào slot (chỉ chế độ collaborative)
    notifyCollabInvite(req.user, moment, req.body.collaboratorIds ?? []);

    res.status(201).json({ success: true, data: moment });
  } catch (error) {
    next(error);
  }
});

// PUT /api/moments/:momentId — chỉnh sửa draft collab của chính mình (chưa đủ slot).
// Chỉ chủ sở hữu + còn đang là draft; đổi template/ảnh/bạn bè → rebuild slots.
router.put(
  "/:momentId",
  requireAuth,
  validate(momentParamsSchema, "params"),
  validate(updateMomentSchema),
  async (req, res, next) => {
    try {
      const { moment, previousCollaboratorIds } =
        await updateDraftMoment(
          req.user.id,
          req.params.momentId,
          req.body,
        );

      // WS: chỉ mời lại những bạn bè MỚI được thêm khi chỉnh sửa
      const newCollaborators = (req.body.collaboratorIds ?? []).filter(
        (friendId) => !previousCollaboratorIds.includes(friendId),
      );
      notifyCollabInvite(req.user, moment, newCollaborators);

      res.json({ success: true, data: moment });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/moments/:momentId/fill — tôi điền ảnh vào slot của mình trong draft collab.
// mediaIds: 1+ ảnh (lấp tuần tự các slot trống của tôi — 1 người giữ nhiều slot thì gửi nhiều ảnh).
router.post(
  "/:momentId/fill",
  requireAuth,
  validate(momentParamsSchema, "params"),
  validate(fillSlotsSchema),
  async (req, res, next) => {
    try {
      const { mediaIds } = req.body;
      const { filled, complete, moment } = await fillMomentSlots(
        req.user.id,
        req.params.momentId,
        mediaIds,
      );

      // WS: moment vừa đủ slot → báo tất cả thành viên để refresh feed
      if (complete) {
        const memberIds = new Set(
          [moment.userId, ...moment.slots.map((s) => s.userId)],
        );
        notifyUsers(memberIds, "moment:collab-complete", {
          momentId: moment.id,
          template: moment.template,
          complete: true,
        });
      }

      res.json({ success: true, data: { filled, complete, moment } });
    } catch (error) {
      next(error);
    }
  },
);

// DELETE /api/moments/:momentId — xóa moment của chính mình
router.delete("/:momentId", requireAuth, validate(momentParamsSchema, "params"), async (req, res, next) => {
  try {
    const removed = await deleteMoment(req.user.id, req.params.momentId);
    if (!removed) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Không tìm thấy moment" },
      });
    }
    res.json({ success: true, data: { removed: true } });
  } catch (error) {
    next(error);
  }
});

// POST /api/moments/:momentId/leave — người được mời gỡ ảnh của mình khỏi moment
// collab (moment quay về trạng thái chưa đủ slot cho creator điều chỉnh lại).
router.post(
  "/:momentId/leave",
  requireAuth,
  validate(momentParamsSchema, "params"),
  async (req, res, next) => {
    try {
      const item = await leaveMoment(
        req.user.id,
        req.params.momentId,
      );
      res.json({ success: true, data: item });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/moments/:momentId/reactions — react bằng emoji
router.post(
  "/:momentId/reactions",
  requireAuth,
  validate(momentParamsSchema, "params"),
  validate(createReactionSchema),
  async (req, res, next) => {
    try {
      const reaction = await createReaction(
        req.user.id,
        req.params.momentId,
        req.body,
      );
      res.status(201).json({ success: true, data: reaction });
    } catch (error) {
      next(error);
    }
  },
);

// DELETE /api/moments/:momentId/reactions — bỏ reaction của mình
router.delete(
  "/:momentId/reactions",
  requireAuth,
  validate(momentParamsSchema, "params"),
  async (req, res, next) => {
    try {
      const removed = await deleteReaction(
        req.user.id,
        req.params.momentId,
      );
      if (!removed) {
        return res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Chưa có reaction để bỏ" },
        });
      }
      res.json({ success: true, data: { removed: true } });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
