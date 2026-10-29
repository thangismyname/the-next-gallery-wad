import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import * as developerService from "./developer.service.js";
import { requestDeveloperSchema } from "./developer.schema.js";

const router = Router();

router.get("/status", requireAuth, async (req, res, next) => {
  try {
    const data = await developerService.getDeveloperStatus(req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post("/request", requireAuth, validate(requestDeveloperSchema), async (req, res, next) => {
  try {
    const data = await developerService.requestDeveloper(
      req.user.id,
      req.body.message,
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

export default router;
