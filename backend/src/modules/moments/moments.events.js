// Tên event WebSocket của Moments — 1 nguồn duy nhất cho routes + notify.
// FE tương ứng: frontend/src/services/signaling.ts::SIGNAL (giữ đồng bộ).
export const MOMENT_EVENTS = {
  MEME_ADDED: "moment:meme-added",
  MEME_REMOVED: "moment:meme-removed",
  MEME_REACTED: "moment:meme-reacted",
  COLLAB_INVITE: "moment:collab-invite",
  COLLAB_COMPLETE: "moment:collab-complete",
  REACTION: "moment:reaction",
  DELETED: "moment:deleted",
  LEFT: "moment:left",
  UPDATED: "moment:updated",
};
