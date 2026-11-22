import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { momentsReadLimit, momentsWriteLimit } from "../../middleware/rateLimit.js";
import {
  listMomentsFeed,
  listMomentInvitations,
  countMomentInvitations,
} from "./moments.feed.service.js";
import {
  createMoment,
  updateDraftMoment,
  patchMomentMeta,
  fillMomentSlots,
  deleteMoment,
  leaveMoment,
  declineMoment,
  getMomentItem,
} from "./moments.collab.service.js";
import { notify } from "../notifications/notifications.service.js";
import { logger } from "../../lib/logger.js";
import { createReaction, deleteReaction } from "./moments.reaction.service.js";
import {
  notifyUsers,
  notifyMomentParticipants,
  notifyCollabInvite,
} from "./moments.notify.js";
import { MOMENT_EVENTS } from "./moments.events.js";
import { getMomentParticipantIds } from "./moments.query.service.js";
import {
  listFeedQuerySchema,
  listInvitationsQuerySchema,
  createMomentSchema,
  updateMomentSchema,
  patchMomentSchema,
  fillSlotsSchema,
  momentParamsSchema,
  createReactionSchema,
} from "./moments.schema.js";
import memeRoutes from "./moments.meme.routes.js";
import { asyncHandler, respond } from "../../middleware/asyncHandler.js";

const router = Router();

// ---- Routes ----

// GET /api/moments — feed moments của mình + bạn bè, theo thời gian mới → cũ
// (chỉ moment HOÀN CHỈNH — draft collab chưa đủ slot không hiện ở đây)
router.get(
  "/",
  requireAuth,
  momentsReadLimit,
  validate(listFeedQuerySchema, "query"),
  respond((req) => listMomentsFeed(req.user.id, { limit: req.query.limit, offset: req.query.offset })),
);

// GET /api/moments/invitations — draft moment collab tôi cần điền / đang chờ bạn.
router.get(
  "/invitations",
  requireAuth,
  momentsReadLimit,
  validate(listInvitationsQuerySchema, "query"),
  respond((req) => listMomentInvitations(req.user.id, { limit: req.query.limit, offset: req.query.offset })),
);

// GET /api/moments/invitations/count — badge sidebar (không tải cả list).
router.get(
  "/invitations/count",
  requireAuth,
  momentsReadLimit,
  asyncHandler(async (req, res) => {
    const count = await countMomentInvitations(req.user.id);
    res.json({ success: true, data: { count } });
  }),
);

// ── Memes (mặt sau thẻ moment khi lật) — moments.meme.routes.js ─────
// Gắn đúng chỗ cũ: /memes/templates phải khớp TRƯỚC các route /:momentId/….
router.use(memeRoutes);

// POST /api/moments — đăng moment từ ảnh/video đã có trong gallery.
// single: mediaId. duo_square/trio_wide: mediaIds (self-fill đủ slot) hoặc
// mediaIds (1..slotCount-1 ảnh của bạn) + collaboratorIds điền phần slot còn lại.
router.post(
  "/",
  requireAuth,
  momentsWriteLimit,
  validate(createMomentSchema),
  asyncHandler(async (req, res) => {
    const moment = await createMoment(req.user.id, req.body);

    // WS: mời bạn bè điền ảnh vào slot (chỉ chế độ collaborative)
    notifyCollabInvite(req.user, moment, req.body.collaboratorIds ?? []);

    res.status(201).json({ success: true, data: moment });
  }),
);

// PUT /api/moments/:momentId — chỉnh sửa draft collab của chính mình (chưa đủ slot).
// Chỉ chủ sở hữu + còn đang là draft; đổi template/ảnh/bạn bè → rebuild slots.
router.put(
  "/:momentId",
  requireAuth,
  momentsWriteLimit,
  validate(momentParamsSchema, "params"),
  validate(updateMomentSchema),
  asyncHandler(async (req, res) => {
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

    // WS: người đang mở draft thấy nội dung mới (P2.9)
    await notifyMomentParticipants(
      req.params.momentId,
      MOMENT_EVENTS.UPDATED,
      { momentId: req.params.momentId },
      { exceptUserId: req.user.id },
    );

    res.json({ success: true, data: moment });
  }),
);

// PATCH /api/moments/:momentId — sửa caption/visibility của moment đã đăng (P3.1).
router.patch(
  "/:momentId",
  requireAuth,
  momentsWriteLimit,
  validate(momentParamsSchema, "params"),
  validate(patchMomentSchema),
  asyncHandler(async (req, res) => {
    const moment = await patchMomentMeta(
      req.user.id,
      req.params.momentId,
      req.body,
    );
    if (!moment) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Không tìm thấy moment" },
      });
    }

    await notifyMomentParticipants(
      req.params.momentId,
      MOMENT_EVENTS.UPDATED,
      { momentId: req.params.momentId },
      { exceptUserId: req.user.id },
    );

    res.json({ success: true, data: moment });
  }),
);

// POST /api/moments/:momentId/fill — tôi điền ảnh vào slot của mình trong draft collab.
// mediaIds: 1+ ảnh (lấp tuần tự các slot trống của tôi — 1 người giữ nhiều slot thì gửi nhiều ảnh).
router.post(
  "/:momentId/fill",
  requireAuth,
  momentsWriteLimit,
  validate(momentParamsSchema, "params"),
  validate(fillSlotsSchema),
  asyncHandler(async (req, res) => {
    const { mediaIds, framings, slotIndexes } = req.body;
    const { filled, complete, moment } = await fillMomentSlots(
      req.user.id,
      req.params.momentId,
      mediaIds,
      framings,
      slotIndexes,
    );

    // WS: moment vừa đủ slot → báo tất cả thành viên để refresh feed
    if (complete) {
      const memberIds = new Set(
        [moment.userId, ...moment.slots.map((s) => s.userId)],
      );
      notifyUsers(memberIds, MOMENT_EVENTS.COLLAB_COMPLETE, {
        momentId: moment.id,
        template: moment.template,
        complete: true,
      });
    }

    res.json({ success: true, data: { filled, complete, moment } });
  }),
);

// DELETE /api/moments/:momentId — người tạo hoặc người tham gia xoá moment (cả bản nháp ghép ảnh)
router.delete(
  "/:momentId",
  requireAuth,
  momentsWriteLimit,
  validate(momentParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    // Lấy người liên quan + nội dung TRƯỚC khi xoá (row + slots biến mất sau DELETE).
    const participantIds = await getMomentParticipantIds(req.params.momentId);
    const before = await getMomentItem(req.params.momentId, req.user.id);
    const removed = await deleteMoment(req.user.id, req.params.momentId);
    if (!removed) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Không tìm thấy moment" },
      });
    }

    notifyUsers(
      participantIds.filter((id) => id !== req.user.id),
      MOMENT_EVENTS.DELETED,
      { momentId: req.params.momentId },
    );
    // Người cùng đăng nhận thông báo lưu lại (thấy cả khi đang offline, tự xoá được).
    notify(participantIds, "moment_deleted", { id: req.user.id, name: req.user.name }, {
      momentId: req.params.momentId,
      template: before?.template ?? null,
      caption: before?.caption ?? null,
    }).catch((err) => logger.error({ err }, "Không tạo được thông báo xoá moment"));

    res.json({ success: true, data: { removed: true } });
  }),
);

// POST /api/moments/:momentId/decline — người được mời từ chối ghép ảnh (ô của họ đánh dấu từ chối,
// người tạo nhận thông báo để sửa lại / xoá). Đồng ý = điền ảnh (POST /:momentId/fill).
router.post(
  "/:momentId/decline",
  requireAuth,
  momentsWriteLimit,
  validate(momentParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const declined = await declineMoment(req.user.id, req.params.momentId);
    if (!declined) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Không có lời mời nào để từ chối" },
      });
    }
    await notifyMomentParticipants(
      req.params.momentId,
      MOMENT_EVENTS.UPDATED,
      { momentId: req.params.momentId, userId: req.user.id },
      { exceptUserId: req.user.id },
    );
    notify([declined.creatorId], "moment_declined", { id: req.user.id, name: req.user.name }, {
      momentId: req.params.momentId,
      template: declined.template,
      caption: declined.caption,
    }).catch((err) => logger.error({ err }, "Không tạo được thông báo từ chối moment"));
    res.json({ success: true, data: { declined: true } });
  }),
);

// POST /api/moments/:momentId/leave — người được mời gỡ ảnh của mình khỏi moment
// collab (moment quay về trạng thái chưa đủ slot cho creator điều chỉnh lại).
router.post(
  "/:momentId/leave",
  requireAuth,
  momentsWriteLimit,
  validate(momentParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const item = await leaveMoment(req.user.id, req.params.momentId);

    // WS: creator + người còn lại thấy draft thay đổi (P2.9)
    await notifyMomentParticipants(
      req.params.momentId,
      MOMENT_EVENTS.LEFT,
      { momentId: req.params.momentId, userId: req.user.id },
      { exceptUserId: req.user.id },
    );

    res.json({ success: true, data: item });
  }),
);

// POST /api/moments/:momentId/reactions — react bằng emoji
router.post(
  "/:momentId/reactions",
  requireAuth,
  momentsWriteLimit,
  validate(momentParamsSchema, "params"),
  validate(createReactionSchema),
  asyncHandler(async (req, res) => {
    const reaction = await createReaction(
      req.user.id,
      req.params.momentId,
      req.body,
    );

    // WS: người khác cập nhật bubble ngay, không cần refetch (P2.9)
    await notifyMomentParticipants(
      req.params.momentId,
      MOMENT_EVENTS.REACTION,
      {
        momentId: req.params.momentId,
        userId: req.user.id,
        userName: req.user.name ?? null,
        userAvatarUrl: req.user.image ?? null,
        emoji: reaction.emoji,
      },
      { exceptUserId: req.user.id },
    );

    res.status(201).json({ success: true, data: reaction });
  }),
);

// DELETE /api/moments/:momentId/reactions — bỏ reaction của mình
router.delete(
  "/:momentId/reactions",
  requireAuth,
  momentsWriteLimit,
  validate(momentParamsSchema, "params"),
  asyncHandler(async (req, res) => {
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

    await notifyMomentParticipants(
      req.params.momentId,
      MOMENT_EVENTS.REACTION,
      {
        momentId: req.params.momentId,
        userId: req.user.id,
        userName: req.user.name ?? null,
        userAvatarUrl: req.user.image ?? null,
        emoji: null,
      },
      { exceptUserId: req.user.id },
    );

    res.json({ success: true, data: { removed: true } });
  }),
);

export default router;
