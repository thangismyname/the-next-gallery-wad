import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { searchLimit } from "../../middleware/rateLimit.js";
import * as friendsService from "./friends.service.js";
import {
  addFriendSchema,
  searchUserQuerySchema,
  requestParamsSchema,
  deleteFriendSchema,
  claimInviteSchema,
} from "./friends.schema.js";

const router = Router();

// ---- Routes ----

// GET /api/friends — danh sách bạn bè đã kết bạn
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const friends = await friendsService.listFriends(req.user.id);
    res.json({ success: true, data: friends });
  } catch (error) {
    next(error);
  }
});

// GET /api/friends/requests — lời mời kết bạn đang chờ nhận
router.get("/requests", requireAuth, async (req, res, next) => {
  try {
    const requests = await friendsService.listFriendRequests(req.user.id);
    res.json({ success: true, data: requests });
  } catch (error) {
    next(error);
  }
});

// GET /api/friends/invite — tạo token mời kết bạn (dùng cho QR/link)
router.get("/invite", requireAuth, async (req, res, next) => {
  try {
    const invite = friendsService.generateInviteToken(req.user.id);
    res.json({ success: true, data: invite });
  } catch (error) {
    next(error);
  }
});

// POST /api/friends/invite/claim — quét link mời → gửi request cho chủ token
router.post("/invite/claim", requireAuth, validate(claimInviteSchema), async (req, res, next) => {
  try {
    const result = await friendsService.claimInviteToken(req.user.id, req.body.token);
    if (!result.valid) {
      return res.status(400).json({
        success: false,
        error: {
          code: result.expired ? "EXPIRED" : "INVALID_TOKEN",
          message: result.expired
            ? "Link mời đã hết hạn"
            : "Link mời không hợp lệ",
        },
      });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// GET /api/friends/search — tìm user theo tên/email (không gửi request)
router.get(
  "/search",
  requireAuth,
  searchLimit, // chặn dò email hàng loạt
  validate(searchUserQuerySchema, "query"),
  async (req, res, next) => {
    try {
      const data = await friendsService.searchUser(req.user.id, req.query.q);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/friends — gửi lời mời kết bạn (status pending)
router.post("/", requireAuth, validate(addFriendSchema), async (req, res, next) => {
  try {
    const { target, result } = await friendsService.sendFriendRequest(
      req.user.id,
      req.body.query,
    );
    res.status(201).json({ success: true, data: target, result });
  } catch (error) {
    next(error);
  }
});

// POST /api/friends/requests/:requestId/accept — chấp nhận lời mời
router.post("/requests/:requestId/accept", requireAuth, validate(requestParamsSchema, "params"), async (req, res, next) => {
  try {
    const { found } = await friendsService.respondToRequest(
      req.user.id,
      req.params.requestId,
      "accept",
    );
    if (!found) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Không tìm thấy lời mời" },
      });
    }
    res.json({ success: true, data: { accepted: true } });
  } catch (error) {
    next(error);
  }
});

// POST /api/friends/requests/:requestId/decline — từ chối lời mời
router.post("/requests/:requestId/decline", requireAuth, validate(requestParamsSchema, "params"), async (req, res, next) => {
  try {
    const { found } = await friendsService.respondToRequest(
      req.user.id,
      req.params.requestId,
      "decline",
    );
    if (!found) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Không tìm thấy lời mời" },
      });
    }
    res.json({ success: true, data: { declined: true } });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/friends/:friendId — xóa bạn bè / hủy kết bạn
router.delete("/:friendId", requireAuth, validate(deleteFriendSchema, "params"), async (req, res, next) => {
  try {
    const removed = await friendsService.deleteFriend(
      req.user.id,
      req.params.friendId,
    );
    res.json({ success: true, data: { removed } });
  } catch (error) {
    next(error);
  }
});

export default router;
