import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { searchLimit } from "../../middleware/rateLimit.js";
import * as friendsService from "./friends.service.js";
import { toFriend, toRequest, toSearchResult, toUser } from "./friends.mapper.js";
import { notifyFriendAccepted, notifyFriendChanged, notifyFriendRequest } from "./friends.notify.js";
import {
  addFriendSchema,
  searchUserQuerySchema,
  requestParamsSchema,
  deleteFriendSchema,
  claimInviteSchema,
} from "./friends.schema.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";

const router = Router();
const notFound = (res, message) =>
  res.status(404).json({ success: false, error: { code: "NOT_FOUND", message } });

/** Lời mời vừa gửi / tự chấp nhận → báo người kia. */
function notifyRequestResult(sender, target, result, requestId) {
  if (result === "sent") notifyFriendRequest(target.id, sender, requestId);
  else if (result === "accepted") notifyFriendAccepted(target.id, sender);
}

// GET /api/friends — bạn bè (A→Z)
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await friendsService.listFriends(req.user.id);
    res.json({ success: true, data: rows.map(toFriend) });
  }),
);

// GET /api/friends/requests — lời mời gửi tới mình
router.get(
  "/requests",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await friendsService.listFriendRequests(req.user.id);
    res.json({ success: true, data: rows.map(toRequest) });
  }),
);

// GET /api/friends/requests/sent — lời mời mình đã gửi (chưa trả lời)
router.get(
  "/requests/sent",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await friendsService.listSentRequests(req.user.id);
    res.json({ success: true, data: rows.map(toRequest) });
  }),
);

// GET /api/friends/invite — token mời kết bạn (QR / link, 7 ngày)
router.get(
  "/invite",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: friendsService.generateInviteToken(req.user.id) });
  }),
);

// POST /api/friends/invite/claim — mở link mời → gửi lời mời cho chủ link
router.post(
  "/invite/claim",
  requireAuth,
  validate(claimInviteSchema),
  asyncHandler(async (req, res) => {
    const result = await friendsService.claimInviteToken(req.user.id, req.body.token);
    if (!result.valid) {
      return res.status(400).json({
        success: false,
        error: {
          code: result.expired ? "EXPIRED" : "INVALID_TOKEN",
          message: result.expired ? "Link mời đã hết hạn" : "Link mời không hợp lệ",
        },
      });
    }
    notifyRequestResult(req.user, result.owner, result.result, result.requestId);
    res.json({ success: true, data: { result: result.result, owner: toUser(result.owner) } });
  }),
);

// GET /api/friends/search?q= — email chính xác (1 người) hoặc tên (≤ 8, email bị che)
router.get(
  "/search",
  requireAuth,
  searchLimit, // chặn dò email hàng loạt
  validate(searchUserQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const rows = await friendsService.searchUsers(req.user.id, req.query.q);
    res.json({ success: true, data: rows.map(toSearchResult) });
  }),
);

// POST /api/friends { userId } — gửi lời mời (người kia đã mời mình → thành bạn luôn)
router.post(
  "/",
  requireAuth,
  searchLimit,
  validate(addFriendSchema),
  asyncHandler(async (req, res) => {
    const { target, result, requestId } = req.body.userId
      ? await friendsService.sendRequestTo(req.user.id, req.body.userId)
      : await friendsService.sendFriendRequest(req.user.id, req.body.query);
    notifyRequestResult(req.user, target, result, requestId);
    res.status(201).json({ success: true, data: toUser(target), result, requestId });
  }),
);

// POST /api/friends/requests/:requestId/accept
router.post(
  "/requests/:requestId/accept",
  requireAuth,
  validate(requestParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const r = await friendsService.respondToRequest(req.user.id, req.params.requestId, "accept");
    if (!r.found) return notFound(res, "Không tìm thấy lời mời");
    notifyFriendAccepted(r.friendId, req.user);
    res.json({ success: true, data: { accepted: true } });
  }),
);

// POST /api/friends/requests/:requestId/decline
router.post(
  "/requests/:requestId/decline",
  requireAuth,
  validate(requestParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const r = await friendsService.respondToRequest(req.user.id, req.params.requestId, "decline");
    if (!r.found) return notFound(res, "Không tìm thấy lời mời");
    notifyFriendChanged(req.user.id, r.friendId);
    res.json({ success: true, data: { declined: true } });
  }),
);

// DELETE /api/friends/requests/:requestId — huỷ lời mời mình đã gửi
router.delete(
  "/requests/:requestId",
  requireAuth,
  validate(requestParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const otherId = await friendsService.cancelSentRequest(req.user.id, req.params.requestId);
    if (!otherId) return notFound(res, "Không tìm thấy lời mời");
    notifyFriendChanged(req.user.id, otherId);
    res.json({ success: true, data: { cancelled: true } });
  }),
);

// DELETE /api/friends/:friendId — huỷ kết bạn
router.delete(
  "/:friendId",
  requireAuth,
  validate(deleteFriendSchema, "params"),
  asyncHandler(async (req, res) => {
    const removed = await friendsService.deleteFriend(req.user.id, req.params.friendId);
    if (removed) notifyFriendChanged(req.user.id, req.params.friendId);
    res.json({ success: true, data: { removed } });
  }),
);

export default router;
