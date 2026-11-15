// Row → DTO (camelCase, khớp frontend services/friends.ts).
export const toFriend = (r) => ({
  id: r.id,
  name: r.name,
  email: r.email,
  avatarUrl: r.image ?? null,
  friendSince: r.since ?? null,
});

/** Lời mời (đến hoặc đã gửi): `id` = id lời mời, `userId` = người kia. */
export const toRequest = (r) => ({
  id: r.id,
  userId: r.user_id,
  name: r.name,
  email: r.email,
  avatarUrl: r.image ?? null,
  requestedAt: r.created_at ?? null,
});

export const toSearchResult = (r) => ({
  id: r.id,
  name: r.name,
  email: r.email,
  avatarUrl: r.image ?? null,
  relationship: r.relationship,
  requestId: r.requestId,
});

export const toUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  avatarUrl: u.image ?? null,
});
