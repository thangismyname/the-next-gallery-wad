import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import * as shareService from "./share.service.js";
import {
  createSessionSchema,
  sessionParamsSchema,
  shareToFriendsSchema,
} from "./share.schema.js";

const router = Router();

// ---- Routes ----

// GET /api/share/sessions — my share history
router.get("/sessions", requireAuth, async (req, res, next) => {
  try {
    const sessions = await shareService.getShareSessionsByUser(req.user.id);
    res.json({ success: true, data: sessions });
  } catch (error) {
    next(error);
  }
});

// GET /api/share/sessions/:id — session details
router.get("/sessions/:id", requireAuth, validate(sessionParamsSchema, "params"), async (req, res, next) => {
  try {
    const session = await shareService.getShareSession(req.params.id, req.user.id);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Không tìm thấy phiên chia sẻ" },
      });
    }

    const receivers = await shareService.getReceivers(session.id);
    res.json({ success: true, data: { ...session, receivers } });
  } catch (error) {
    next(error);
  }
});

// POST /api/share/sessions — create session (REST fallback for non-WS clients)
router.post("/sessions", requireAuth, validate(createSessionSchema, "body"), async (req, res, next) => {
  try {
    const session = await shareService.createShareSession(req.user.id, req.body.mediaIds);
    res.status(201).json({ success: true, data: session });
  } catch (error) {
    next(error);
  }
});

// POST /api/share/sessions/:id/complete — mark complete
router.post("/sessions/:id/complete", requireAuth, validate(sessionParamsSchema, "params"), async (req, res, next) => {
  try {
    const session = await shareService.completeShareSession(req.params.id, req.user.id);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Không tìm thấy phiên chia sẻ" },
      });
    }
    res.json({ success: true, data: session });
  } catch (error) {
    next(error);
  }
});

// GET /api/share/friends — friends list for sharing
router.get("/friends", requireAuth, async (req, res, next) => {
  try {
    const friends = await shareService.getFriends(req.user.id);
    res.json({ success: true, data: friends });
  } catch (error) {
    next(error);
  }
});

// POST /api/share/to-friends — send media to friends (creates notifications)
router.post("/to-friends", requireAuth, validate(shareToFriendsSchema), async (req, res, next) => {
  try {
    const data = await shareService.shareToFriends(
      req.user,
      req.body.mediaIds,
      req.body.friendIds,
    );
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

export default router;