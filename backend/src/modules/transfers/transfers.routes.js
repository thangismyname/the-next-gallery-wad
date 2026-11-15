// /api/transfers — gửi file: link/QR cho khách (không cần đăng nhập) + gửi thẳng
// bạn bè. Byte đi P2P (WebRTC) giữa 2 trình duyệt; server chỉ giữ: manifest,
// part relay ĐÃ MÃ HOÁ (dự phòng) và ảnh thư viện (copy / stream từ MinIO).
// Khách xác thực bằng header X-Transfer-Token.
import express, { Router } from "express";
import { optionalAuth, requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import {
  relayLimit,
  transferCodeLimit,
  transferWriteLimit,
} from "../../middleware/rateLimit.js";
import { dbPool } from "../../config/db.js";
import { sendToUser } from "../../ws/services/signaling.service.js";
import * as hub from "../../ws/services/transfer.hub.js";
import {
  createMediaRangeStream,
  createMediaStream,
  getObjectSize,
  parseRange,
} from "../media/media.stream.service.js";
import { RELAY_PART_MAX_BYTES } from "./transfers.constants.js";
import {
  createTransferSchema,
  deviceKeySchema,
  deviceKeysQuerySchema,
  fileParamsSchema,
  partParamsSchema,
  resolveCodeSchema,
  transferParamsSchema,
} from "./transfers.schema.js";
import { accessFromRequest, isTransferOpen, resolveTransferAccess } from "./transfers.access.js";
import { httpError } from "../../middleware/errorHandler.js";
import * as service from "./transfers.service.js";
import * as relay from "./transfers.relay.service.js";
import { copyMediaToRecipients } from "./transfers.copy.service.js";
import { buildIceServers, listFriendDeviceKeys, upsertDeviceKey } from "./transfers.keys.service.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";

const router = Router();

// ---- ICE (STUN + TURN tạm thời) ----
// TURN là relay băng thông lớn → chỉ cấp cho user đăng nhập hoặc người có token phiên gửi.
router.get(
  "/ice",
  optionalAuth,
  asyncHandler(async (req, res) => {
    let identity = req.user?.id;
    if (!identity) {
      const transferId = String(req.query.transferId || "");
      const token = req.get("x-transfer-token");
      if (!transferId || !token) throw httpError(401, "UNAUTHORIZED", "Thiếu token phiên gửi");
      await resolveTransferAccess({ transferId, token });
      identity = `guest-${transferId.slice(0, 8)}`;
    }
    res.json({ success: true, data: buildIceServers(identity) });
  }),
);

// ---- Khoá thiết bị (ECDH) ----
router.put(
  "/keys",
  requireAuth,
  validate(deviceKeySchema),
  asyncHandler(async (req, res) => {
    await upsertDeviceKey(req.user.id, req.body.deviceId, req.body.publicKey);
    res.json({ success: true });
  }),
);

router.get(
  "/keys",
  requireAuth,
  validate(deviceKeysQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await listFriendDeviceKeys(req.user.id, req.query.userIds) });
  }),
);

// ---- Mã 6 số → token riêng ----
router.post(
  "/code",
  transferCodeLimit,
  validate(resolveCodeSchema),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await service.redeemCode(req.body.code) });
  }),
);

// ---- Lịch sử + tạo ----
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await service.listTransfers(req.user.id) });
  }),
);

router.post(
  "/",
  requireAuth,
  transferWriteLimit,
  validate(createTransferSchema),
  asyncHandler(async (req, res) => {
    const created = await service.createTransfer(req.user, req.body);
    if (req.body.kind === "direct") {
      // Ảnh thư viện → copy ngay vào thư viện bạn bè (không cần ai online).
      const copied = await copyMediaToRecipients(req.user.id, created.libraryMediaIds, created.recipientIds);
      if (created.deviceFileCount === 0) await service.markRecipientsCopied(created.id, copied);
      const payload = {
        transferId: created.id,
        sender: { id: req.user.id, name: req.user.name, avatarUrl: req.user.image ?? null },
        fileCount: req.body.files.length,
        libraryCount: created.libraryMediaIds.length,
      };
      for (const userId of created.recipientIds) sendToUser(userId, "xfer:incoming", payload);
    }
    res.status(201).json({ success: true, data: { id: created.id, token: created.token } });
  }),
);

// ---- Chi tiết / thao tác 1 phiên ----
router.get(
  "/:id",
  optionalAuth,
  validate(transferParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const access = await accessFromRequest(req);
    const data = await service.getTransferDetail(access, { hostOnline: hub.isHostOnline(req.params.id) });
    res.json({ success: true, data });
  }),
);

router.post(
  "/:id/revoke",
  requireAuth,
  transferWriteLimit,
  validate(transferParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    await service.revokeTransfer(req.user.id, req.params.id);
    hub.closeTransfer(req.params.id);
    res.json({ success: true });
  }),
);

router.post(
  "/:id/code",
  requireAuth,
  transferWriteLimit,
  validate(transferParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await service.refreshCode(req.user.id, req.params.id) });
  }),
);

router.post(
  "/:id/decline",
  requireAuth,
  validate(transferParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const { recipient } = await accessFromRequest(req);
    if (!recipient) throw httpError(400, "NOT_RECIPIENT", "Bạn không phải người nhận");
    const updated = await service.reportRecipient(recipient.id, { status: "declined" });
    hub.notifyHost(req.params.id, "xfer:recipient", { transferId: req.params.id, recipient: updated });
    res.json({ success: true });
  }),
);

/** Người nhận đã đăng nhập lưu ảnh thư viện của người gửi vào thư viện mình (copy phía server). */
router.post(
  "/:id/save",
  requireAuth,
  transferWriteLimit,
  validate(transferParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const access = await accessFromRequest(req);
    if (access.role === "sender") throw httpError(400, "OWN_TRANSFER", "Đây là phiên gửi của bạn");
    const fileIds = Array.isArray(req.body?.fileIds) ? req.body.fileIds.map(String) : null;
    const files = (await service.listFiles(req.params.id)).filter(
      (f) => f.media_id && (!fileIds || fileIds.includes(f.id)),
    );
    const copied = await copyMediaToRecipients(
      access.transfer.sender_id,
      files.map((f) => String(f.media_id)),
      [req.user.id],
    );
    res.json({ success: true, data: { saved: copied.length ? files.length : 0 } });
  }),
);

// ---- Relay (part đã mã hoá) ----
router.put(
  "/:id/files/:fileId/parts/:part",
  requireAuth,
  relayLimit,
  validate(partParamsSchema, "params"),
  express.raw({ type: () => true, limit: RELAY_PART_MAX_BYTES }),
  asyncHandler(async (req, res) => {
    const access = await accessFromRequest(req);
    if (access.role !== "sender") throw httpError(403, "FORBIDDEN", "Chỉ người gửi mới tải lên được");
    if (!isTransferOpen(access.transfer)) {
      throw httpError(410, "TRANSFER_CLOSED", "Phiên gửi đã đóng");
    }
    const file = await service.getFile(req.params.id, req.params.fileId);
    const result = await relay.putRelayPart(req.params.id, file, req.params.part, req.body);
    hub.notifyReceivers(req.params.id, "xfer:relay", {
      transferId: req.params.id,
      fileId: file.id,
      ...result,
    });
    res.json({ success: true, data: result });
  }),
);

router.get(
  "/:id/files/:fileId/parts",
  optionalAuth,
  validate(fileParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    await accessFromRequest(req);
    const file = await service.getFile(req.params.id, req.params.fileId);
    res.json({ success: true, data: { parts: await relay.listRelayParts(file.id) } });
  }),
);

router.get(
  "/:id/files/:fileId/parts/:part",
  optionalAuth,
  relayLimit,
  validate(partParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    await accessFromRequest(req);
    const file = await service.getFile(req.params.id, req.params.fileId);
    const { stream, size } = await relay.getRelayPartStream(req.params.id, file.id, req.params.part);
    res.set({
      "Content-Type": "application/octet-stream",
      "Content-Length": String(size),
      "Cache-Control": "private, no-store",
    });
    stream.on("error", (err) => res.destroy(err));
    stream.pipe(res);
  }),
);

// ---- Ảnh thư viện trong phiên link: stream bản gốc từ MinIO (Range để tải tiếp) ----
router.get(
  "/:id/files/:fileId/content",
  optionalAuth,
  validate(fileParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const access = await accessFromRequest(req);
    const file = await service.getFile(req.params.id, req.params.fileId);
    if (!file.media_id) throw httpError(400, "NOT_LIBRARY", "File này gửi trực tiếp, không có trên server");
    const { rows } = await dbPool.query(
      `SELECT minio_bucket, minio_object FROM media
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [file.media_id, access.transfer.sender_id],
    );
    if (!rows[0]) throw httpError(404, "FILE_GONE", "Người gửi đã xoá file này");
    const { minio_bucket: bucket, minio_object: object } = rows[0];
    const size = await getObjectSize(bucket, object);
    const range = req.headers.range ? parseRange(req.headers.range, size) : null;
    if (range === false) {
      res.status(416).set("Content-Range", `bytes */${size}`).end();
      return;
    }
    res.set({
      "Content-Type": file.mime,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
    });
    let stream;
    if (range) {
      res.status(206).set({
        "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
        "Content-Length": String(range.end - range.start + 1),
      });
      stream = await createMediaRangeStream(bucket, object, range.start, range.end);
    } else {
      res.set("Content-Length", String(size));
      stream = await createMediaStream(bucket, object);
    }
    stream.on("error", (err) => res.destroy(err));
    stream.pipe(res);
  }),
);

export default router;
