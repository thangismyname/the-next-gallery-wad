import { Router } from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "../../lib/auth.js";

const router = Router();

router.all("*", toNodeHandler(auth));

export default router;
