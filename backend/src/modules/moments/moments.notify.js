// Thông báo realtime (WebSocket) cho các sự kiện moment.
import { sendToUser } from "../../ws/services/signaling.service.js";
import { COLLAB_SLOT_COUNT, DRAFT_TTL_MS } from "./moments.constants.js";
import { getMomentParticipantIds } from "./moments.query.service.js";

export function notifyUsers(userIds, type, payload) {
  for (const userId of userIds) {
    sendToUser(userId, type, payload);
  }
}

// Gửi tới owner + người trong collab của moment (trừ `exceptUserId` nếu có).
export async function notifyMomentParticipants(
  momentId,
  type,
  payload,
  { exceptUserId } = {},
) {
  const memberIds = await getMomentParticipantIds(momentId);
  notifyUsers(
    memberIds.filter((memberId) => memberId !== exceptUserId),
    type,
    payload,
  );
}

// Mời bạn bè điền ảnh vào slot của moment collab.
export function notifyCollabInvite(inviter, moment, friendIds) {
  notifyUsers(friendIds, "moment:collab-invite", {
    momentId: moment.id,
    template: moment.template,
    slotCount: COLLAB_SLOT_COUNT[moment.template] ?? 1,
    inviterId: inviter.id,
    inviterName: inviter.name ?? "Bạn",
    inviterAvatar: inviter.image ?? null,
    expiresIn: DRAFT_TTL_MS,
  });
}
