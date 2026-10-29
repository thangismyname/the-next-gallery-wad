// Thông báo realtime (WebSocket) cho album chung.
import { sendToUser } from "../../ws/services/signaling.service.js";

export function notifyAlbumInvite(inviter, album, userIds) {
  for (const userId of userIds) {
    sendToUser(userId, "album:invite", {
      albumId: String(album.id),
      albumName: album.name,
      inviterId: inviter.id,
      inviterName: inviter.name ?? "Bạn",
      inviterAvatar: inviter.image ?? null,
    });
  }
}
