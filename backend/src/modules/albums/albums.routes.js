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
import {
  albumParamsSchema,
  autoPageQuerySchema,
  autoParamsSchema,
  autoQuerySchema,
  saveAutoSchema,
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

// Album: owner = albums.user_id; thành viên (album_members) editor / viewer.
// Mọi kiểm tra quyền nằm trong service (albums.access.js).
const router = Router();
const byId = validate(albumParamsSchema, "params");

// Bọc handler async: lỗi (kể cả 403/404 từ service) → errorHandler.
const handle = (fn) => async (req, res, next) => {
  try {
    const data = await fn(req, res);
    if (!res.headersSent) res.json({ success: true, data: data ?? null });
  } catch (error) {
    next(error);
  }
};

// ── Album ────────────────────────────────────────────────────────────
// { owned, shared, invitations }
router.get("/", requireAuth, handle((req) => listAlbums(req.user.id)));

router.post(
  "/",
  requireAuth,
  validate(createAlbumSchema),
  handle(async (req, res) => {
    res.status(201);
    return createAlbum(req.user.id, req.body);
  }),
);

// ── Album tự động (tính từ dữ liệu sẵn có, chỉ đọc). Đặt TRƯỚC /:id. ──
router.get(
  "/auto",
  requireAuth,
  validate(autoQuerySchema, "query"),
  handle((req) => listAutoAlbums(req.user.id, req.query)),
);

router.get(
  "/auto/:key/media",
  requireAuth,
  validate(autoParamsSchema, "params"),
  validate(autoPageQuerySchema, "query"),
  handle((req) => listAutoAlbumMedia(req.user.id, req.params.key, req.query)),
);

// Chốt thành album thường (sửa / sắp xếp / chia sẻ được).
router.post(
  "/auto/:key/save",
  requireAuth,
  validate(autoParamsSchema, "params"),
  validate(saveAutoSchema),
  handle(async (req, res) => {
    res.status(201);
    return saveAutoAlbum(req.user.id, req.params.key, req.body);
  }),
);

// Album chứa 1 ảnh (Lightbox → Chi tiết). Đặt TRƯỚC /:id.
router.get(
  "/containing/:mediaId",
  requireAuth,
  validate(containingParamsSchema, "params"),
  handle((req) => listAlbumsContaining(req.user.id, req.params.mediaId)),
);

router.get("/:id", requireAuth, byId, handle((req) => getAlbum(req.user.id, req.params.id)));

router.patch(
  "/:id",
  requireAuth,
  byId,
  validate(updateAlbumSchema),
  handle((req) => updateAlbum(req.user.id, req.params.id, req.body)),
);

router.delete("/:id", requireAuth, byId, handle((req) => deleteAlbum(req.user.id, req.params.id)));

// Album thông minh → album thường (chốt danh sách ảnh hiện tại).
router.post(
  "/:id/convert",
  requireAuth,
  byId,
  handle((req) => convertToManual(req.user.id, req.params.id)),
);

// ── Ảnh trong album ───────────────────────────────────────────────────
router.get(
  "/:id/media",
  requireAuth,
  byId,
  validate(pageQuerySchema, "query"),
  handle((req) => listAlbumMedia(req.user.id, req.params.id, req.query)),
);

router.post(
  "/:id/media",
  requireAuth,
  byId,
  validate(mediaIdsBodySchema),
  handle((req) => addAlbumMedia(req.user.id, req.params.id, req.body.mediaIds)),
);

router.post(
  "/:id/media/remove",
  requireAuth,
  byId,
  validate(mediaIdsBodySchema),
  handle((req) => removeAlbumMedia(req.user.id, req.params.id, req.body.mediaIds)),
);

// Sắp lại thứ tự ảnh (owner, album thường) — body: toàn bộ id theo thứ tự mới.
router.put(
  "/:id/media/order",
  requireAuth,
  byId,
  validate(reorderSchema),
  handle((req) => reorderAlbumMedia(req.user.id, req.params.id, req.body.mediaIds)),
);

// ── Thành viên (album chung) ──────────────────────────────────────────
router.get("/:id/members", requireAuth, byId, handle((req) => listMembers(req.user.id, req.params.id)));

router.post(
  "/:id/members",
  requireAuth,
  byId,
  validate(inviteMembersSchema),
  handle(async (req) => {
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
  handle((req) =>
    updateMemberRole(req.user.id, req.params.id, req.params.userId, req.body.role),
  ),
);

// Owner gỡ thành viên; thành viên gọi với userId của chính mình = rời album.
router.delete(
  "/:id/members/:userId",
  requireAuth,
  validate(memberParamsSchema, "params"),
  handle((req) => removeMember(req.user.id, req.params.id, req.params.userId)),
);

router.post(
  "/:id/invitation",
  requireAuth,
  byId,
  validate(respondInviteSchema),
  handle((req) => respondInvitation(req.user.id, req.params.id, req.body.accept)),
);

// ── Link công khai ────────────────────────────────────────────────────
router.get("/:id/links", requireAuth, byId, handle((req) => listLinks(req.user.id, req.params.id)));

router.post(
  "/:id/links",
  requireAuth,
  byId,
  validate(createLinkSchema),
  handle(async (req, res) => {
    res.status(201);
    return createLink(req.user.id, req.params.id, req.body);
  }),
);

router.delete(
  "/:id/links/:linkId",
  requireAuth,
  validate(linkParamsSchema, "params"),
  handle((req) => deleteLink(req.user.id, req.params.id, req.params.linkId)),
);

export default router;
