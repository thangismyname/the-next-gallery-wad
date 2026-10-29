import { Router } from "express";
import authRoutes from "./auth/auth.routes.js";
import mediaRoutes from "./media/media.routes.js";
import adminRoutes from "./admin/admin.routes.js";
import healthRoutes from "./health/health.routes.js";
import friendsRoutes from "./friends/friends.routes.js";
import shareRoutes from "./share/share.routes.js";
import momentsRoutes from "./moments/moments.routes.js";
import developerRoutes from "./developer/developer.routes.js";
import profileRoutes from "./profile/profile.routes.js";
import albumsRoutes from "./albums/albums.routes.js";
import albumsPublicRoutes from "./albums/albums.public.routes.js";
import labelsRoutes from "./labels/labels.routes.js";

const router = Router();

router.use("/api/auth", authRoutes);
router.use("/api/gallery/media", mediaRoutes);
router.use("/api/admin", adminRoutes);
router.use("/health", healthRoutes);
router.use("/api/health", healthRoutes);
router.use("/api/friends", friendsRoutes);
router.use("/api/share", shareRoutes);
router.use("/api/moments", momentsRoutes);
router.use("/api/developer", developerRoutes);
router.use("/api/profile", profileRoutes);
router.use("/api/albums", albumsRoutes);
router.use("/api/public", albumsPublicRoutes);
router.use("/api/labels", labelsRoutes);

export default router;
