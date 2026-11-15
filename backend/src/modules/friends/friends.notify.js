// Thông báo realtime (WebSocket) cho bạn bè:
//   friend:request  { requestId, from }   — có lời mời mới
//   friend:accepted { friend }            — lời mời của mình được chấp nhận
//   friend:changed  {}                    — bị từ chối / huỷ / huỷ kết bạn → làm mới danh sách
// Vừa thành bạn → gửi presence cho nhau ngay (không cần tải lại trang để thấy chấm online).
import { getPeer, sendToUser } from "../../ws/services/signaling.service.js";

const publicUser = (u) => ({ id: u.id, name: u.name, image: u.image ?? null });

export function notifyFriendRequest(targetId, requester, requestId) {
  sendToUser(targetId, "friend:request", { requestId, from: publicUser(requester) });
}

export function notifyFriendAccepted(requesterId, accepter) {
  sendToUser(requesterId, "friend:accepted", { friend: publicUser(accepter) });
  const a = getPeer(accepter.id);
  const b = getPeer(requesterId);
  if (a && b) {
    sendToUser(requesterId, "presence:online", {
      user: { userId: a.userId, username: a.username, avatarUrl: a.avatarUrl },
    });
    sendToUser(accepter.id, "presence:online", {
      user: { userId: b.userId, username: b.username, avatarUrl: b.avatarUrl },
    });
  }
}

export function notifyFriendChanged(userId, otherId) {
  sendToUser(otherId, "friend:changed", {});
  // Hết là bạn → không còn thấy online của nhau.
  sendToUser(otherId, "presence:offline", { userId });
  sendToUser(userId, "presence:offline", { userId: otherId });
}
