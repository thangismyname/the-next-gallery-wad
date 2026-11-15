import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import {
  addAlbumMedia,
  convertToManual,
  createAlbum,
  deleteAlbum,
  getAlbum,
  listAlbumMedia,
  listAlbums,
  removeAlbumMedia,
  reorderAlbumMedia,
  listAlbumsContaining,
  updateAlbum,
} from "./albums.service.js";
import {
  inviteMembers,
  listMembers,
  removeMember,
  respondInvitation,
  updateMemberRole,
} from "./albums.members.service.js";
import { createLink, deleteLink, listLinks } from "./albums.links.service.js";
import { listAutoAlbumMedia, listAutoAlbums, saveAutoAlbum } from "./albums.auto.service.js";
import { notifyAlbumInvite } from "./albums.notify.js";
import { previewSmartRule } from "./albums.smart.service.js";
import { searchLimit } from "../../middleware/rateLimit.js";
import {
  albumParamsSchema,
  autoPageQuerySchema,
  autoParamsSchema,
  autoQuerySchema,
  saveAutoSchema,
  smartPreviewSchema,
  createAlbumSchema,
  createLinkSchema,
  inviteMembersSchema,
  linkParamsSchema,
  mediaIdsBodySchema,
  memberParamsSchema,
  pageQuerySchema,
  reorderSchema,
  containingParamsSchema,
  respondInviteSchema,
  updateAlbumSchema,
  updateMemberSchema,
} from "./albums.schema.js";
import { respond } from "../../middleware/asyncHandler.js";

// Album: owner = albums.user_id; thành viên (album_members) editor / viewer.
// Mọi kiểm tra quyền nằm trong service (albums.access.js).
const router = Router();
const byId = validate(albumParamsSchema, "params");

// ── Album ────────────────────────────────────────────────────────────
// { owned, shared, invitations }
router.get("/", requireAuth, respond((req) => listAlbums(req.user.id)));

router.post(
  "/",
  requireAuth,
  validate(createAlbumSchema),
  respond(async (req, res) => {
    res.status(201);
    return createAlbum(req.user.id, req.body);
  }),
);

// Xem trước album thông minh (số ảnh khớp + vài ảnh) trước khi lưu. Đặt TRƯỚC /:id.
router.post(
  "/smart/preview",
  requireAuth,
  searchLimit,
  validate(smartPreviewSchema),
  respond((req) => previewSmartRule(req.user.id, req.body.smartRule)),
);

// ── Album tự động (tính từ dữ liệu sẵn có, chỉ đọc). Đặt TRƯỚC /:id. ──
router.get(
  "/auto",
  requireAuth,
  validate(autoQuerySchema, "query"),
  respond((req) => listAutoAlbums(req.user.id, req.query)),
);

router.get(
  "/auto/:key/media",
  requireAuth,
  validate(autoParamsSchema, "params"),
  validate(autoPageQuerySchema, "query"),
  respond((req) => listAutoAlbumMedia(req.user.id, req.params.key, req.query)),
);

// Chốt thành album thường (sửa / sắp xếp / chia sẻ được).
router.post(
  "/auto/:key/save",
  requireAuth,
  validate(autoParamsSchema, "params"),
  validate(saveAutoSchema),
  respond(async (req, res) => {
    res.status(201);
    return saveAutoAlbum(req.user.id, req.params.key, req.body);
  }),
);

// Album chứa 1 ảnh (Lightbox → Chi tiết). Đặt TRƯỚC /:id.
router.get(
  "/containing/:mediaId",
  requireAuth,
  validate(containingParamsSchema, "params"),
  respond((req) => listAlbumsContaining(req.user.id, req.params.mediaId)),
);

router.get("/:id", requireAuth, byId, respond((req) => getAlbum(req.user.id, req.params.id)));

router.patch(
  "/:id",
  requireAuth,
  byId,
  validate(updateAlbumSchema),
  respond((req) => updateAlbum(req.user.id, req.params.id, req.body)),
);

router.delete("/:id", requireAuth, byId, respond((req) => deleteAlbum(req.user.id, req.params.id)));

// Album thông minh → album thường (chốt danh sách ảnh hiện tại).
router.post(
  "/:id/convert",
  requireAuth,
  byId,
  respond((req) => convertToManual(req.user.id, req.params.id)),
);

// ── Ảnh trong album ───────────────────────────────────────────────────
router.get(
  "/:id/media",
  requireAuth,
  byId,
  validate(pageQuerySchema, "query"),
  respond((req) => listAlbumMedia(req.user.id, req.params.id, req.query)),
);

router.post(
  "/:id/media",
  requireAuth,
  byId,
  validate(mediaIdsBodySchema),
  respond((req) => addAlbumMedia(req.user.id, req.params.id, req.body.mediaIds)),
);

router.post(
  "/:id/media/remove",
  requireAuth,
  byId,
  validate(mediaIdsBodySchema),
  respond((req) => removeAlbumMedia(req.user.id, req.params.id, req.body.mediaIds)),
);

// Sắp lại thứ tự ảnh (owner, album thường) — body: toàn bộ id theo thứ tự mới.
router.put(
  "/:id/media/order",
  requireAuth,
  byId,
  validate(reorderSchema),
  respond((req) => reorderAlbumMedia(req.user.id, req.params.id, req.body.mediaIds)),
);

// ── Thành viên (album chung) ──────────────────────────────────────────
router.get("/:id/members", requireAuth, byId, respond((req) => listMembers(req.user.id, req.params.id)));

router.post(
  "/:id/members",
  requireAuth,
  byId,
  validate(inviteMembersSchema),
  respond(async (req) => {
    const { album, invitedIds } = await inviteMembers(req.user.id, req.params.id, req.body);
    notifyAlbumInvite(req.user, album, invitedIds);
    return listMembers(req.user.id, req.params.id);
  }),
);

router.patch(
  "/:id/members/:userId",
  requireAuth,
  validate(memberParamsSchema, "params"),
  validate(updateMemberSchema),
  respond((req) =>
    updateMemberRole(req.user.id, req.params.id, req.params.userId, req.body.role),
  ),
);

// Owner gỡ thành viên; thành viên gọi với userId của chính mình = rời album.
router.delete(
  "/:id/members/:userId",
  requireAuth,
  validate(memberParamsSchema, "params"),
  respond((req) => removeMember(req.user.id, req.params.id, req.params.userId)),
);

router.post(
  "/:id/invitation",
  requireAuth,
  byId,
  validate(respondInviteSchema),
  respond((req) => respondInvitation(req.user.id, req.params.id, req.body.accept)),
);

// ── Link công khai ────────────────────────────────────────────────────
router.get("/:id/links", requireAuth, byId, respond((req) => listLinks(req.user.id, req.params.id)));

router.post(
  "/:id/links",
  requireAuth,
  byId,
  validate(createLinkSchema),
  respond(async (req, res) => {
    res.status(201);
    return createLink(req.user.id, req.params.id, req.body);
  }),
);

router.delete(
  "/:id/links/:linkId",
  requireAuth,
  validate(linkParamsSchema, "params"),
  respond((req) => deleteLink(req.user.id, req.params.id, req.params.linkId)),
);

export default router;
