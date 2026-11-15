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
    // Bản thumbnail cho card moment (400px "med") — thay vì "small" (200px)
    // để card vừa khít theo thiết kế card bo cong 2xl.
    thumbnailUrl: mediaId ? mediaThumbUrl(mediaId, "med") : null,
    // Bản lớn cho màn retina (P3.8).
    displayUrl: mediaId ? mediaThumbUrl(mediaId, "display") : null,
    // Bản thumbnail nhỏ 200px dùng cho dropdown lời mời (MomentInviteButton).
    thumbSmallUrl: mediaId ? mediaThumbUrl(mediaId, "small") : null,
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
    // Ảnh của moment single đã bị xoá vĩnh viễn → card hiện placeholder
    // "Ảnh đã bị xoá" thay vì <img src=""> (P2.6).
    missingMedia: template === "single" && !mediaId,
    memeCount: Number(row.meme_count) || 0,
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
    // Bản thumbnail nhỏ dùng cho slot card (200px "small") — khớp với
    // thumbnailUrl trên moment item nhưng dùng cho ô slot thu hẹp.
    thumbnailUrl: mediaId ? mediaThumbUrl(mediaId, "small") : null,
    url: mediaId ? mediaFileUrl(mediaId) : null,
    width: row.width ?? 800,
    height: row.height ?? 600,
    durationSeconds:
      row.duration_seconds != null ? Number(row.duration_seconds) : null,
    // Slot chỉ "đã điền" khi có ảnh còn tồn tại. filled_at còn nhưng ảnh mất
    // (xoá vĩnh viễn / thùng rác) → missing = true để FE hiện placeholder.
    filled: Boolean(row.filled_at && mediaId),
    missing: Boolean(row.filled_at && !mediaId),
    filledAt: row.filled_at ?? null,
  };
}
