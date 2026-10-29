// Row → DTO cho albums (pure, không DB).
import { mediaThumbUrl, toMediaItem } from "../media/media.mapper.js";

export function toAlbumSummary(row, { mediaCount, coverId } = {}) {
  const cover = coverId !== undefined ? coverId : row.cover_id;
  return {
    id: String(row.id),
    name: row.name,
    description: row.description ?? null,
    kind: row.kind === "smart" ? "smart" : "manual",
    smartRule: row.smart_rule ?? null,
    coverMediaId: row.cover_media_id ? String(row.cover_media_id) : null,
    coverUrl: cover ? mediaThumbUrl(String(cover), "med") : null,
    mediaCount: mediaCount ?? row.media_count ?? 0,
    memberCount: row.member_count ?? 0,
    role: row.role,
    pending: row.role !== "owner" && !row.accepted_at,
    owner: {
      id: String(row.user_id),
      name: row.owner_name ?? null,
      image: row.owner_image ?? null,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Media trong album: thêm chủ ảnh + người thêm (album chung). */
export function toAlbumMediaItem(row) {
  return {
    ...toMediaItem(row),
    ownerId: row.owner_id ? String(row.owner_id) : null,
    addedBy: row.added_by ? String(row.added_by) : null,
  };
}

export function toMember(row) {
  return {
    userId: String(row.user_id),
    name: row.name ?? null,
    email: row.email ?? null,
    image: row.image ?? null,
    role: row.role,
    pending: row.role !== "owner" && !row.accepted_at,
    invitedAt: row.invited_at ?? null,
  };
}

export function toShareLink(row) {
  return {
    id: String(row.id),
    token: row.token,
    permission: row.permission,
    expiresAt: row.expires_at ?? null,
    maxViews: row.max_views ?? null,
    viewCount: row.view_count ?? 0,
    createdAt: row.created_at,
  };
}
