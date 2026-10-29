// Chuyển row DB → object moment / slot trả về cho FE (thuần, không truy vấn DB).
import { mediaFileUrl, mediaThumbUrl } from "../media/media.mapper.js";

export function toMomentItem(row, userId) {
  const template = row.template || "single";
  const slots = row._slots ?? [];
  // Cover = media đầu tiên có ảnh (ưu tiên slot 0). Dùng khi moment là collab.
  const cover = slots.find((s) => s.mediaId) || slots[0] || null;
  const mediaId = row.media_id ? String(row.media_id) : (cover?.mediaId ?? null);
  return {
    id: String(row.id),
    userId: row.user_id,
    userName: row.user_name,
    userAvatarUrl: row.user_avatar || null,
    template,
    slots,
    mediaId,
    mediaType: row.media_type ?? cover?.mediaType ?? "photo",
    caption: row.caption || null,
    visibility: row.visibility,
    thumbnailUrl: mediaId ? mediaThumbUrl(mediaId, "small") : null,
    url: mediaId ? mediaFileUrl(mediaId) : null,
    width: row.width || cover?.width || 800,
    height: row.height || cover?.height || 600,
    durationSeconds:
      row.duration_seconds != null
        ? Number(row.duration_seconds)
        : (cover?.durationSeconds ?? null),
    createdAt: row.created_at ?? null,
    isOwn: row.user_id === userId,
    isParticipant:
      row.user_id !== userId && slots.some((s) => s.userId === userId),
    reactions: row.reactions ?? [],
    recentReactions: row.recent_reactions ?? [],
    myReaction: row.my_reaction ?? null,
    memeCount: 0,
  };
}

// 1 row moment_collab (+ user, media) → 1 slot.
export function toSlotItem(row) {
  const mediaId = row.media_id ? String(row.media_id) : null;
  return {
    slotIndex: row.slot_index,
    userId: row.user_id,
    userName: row.user_name,
    userAvatarUrl: row.user_avatar || null,
    mediaId,
    mediaType: row.media_type ?? "photo",
    thumbnailUrl: mediaId ? mediaThumbUrl(mediaId, "small") : null,
    url: mediaId ? mediaFileUrl(mediaId) : null,
    width: row.width ?? 800,
    height: row.height ?? 600,
    durationSeconds:
      row.duration_seconds != null ? Number(row.duration_seconds) : null,
    filled: Boolean(row.filled_at),
    filledAt: row.filled_at ?? null,
  };
}
