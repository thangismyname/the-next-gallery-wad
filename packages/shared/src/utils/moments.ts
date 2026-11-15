// Moments feed helpers shared by web + mobile (pure, no React / storage).
import type { Moment } from "../types";

/** Moment card picture = 3:4 portrait (height ÷ width) — not Locket's square. */
export const MOMENT_ASPECT = 4 / 3;

/** Feed filter: everyone · only my moments · one person's (their user id). */
export type MomentFilter = "all" | "me" | { userId: string };

export interface MomentPerson {
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  /** Newest moment of this person in the loaded feed. */
  latestAt: string;
  /** They have a moment newer than `seenUntil`. */
  unseen: boolean;
}

/** Everyone with a filled slot in a moment (creator first, deduped). */
export function momentPeople(m: Moment): { userId: string; userName: string; userAvatarUrl: string | null }[] {
  const out = [{ userId: m.userId, userName: m.userName, userAvatarUrl: m.userAvatarUrl ?? null }];
  const seen = new Set([m.userId]);
  for (const slot of m.slots) {
    if (!slot.filled || !slot.userId || seen.has(slot.userId)) continue;
    seen.add(slot.userId);
    out.push({ userId: slot.userId, userName: slot.userName, userAvatarUrl: slot.userAvatarUrl ?? null });
  }
  return out;
}

/** A friend's moment created after `seenUntil` (ISO) — my own are never "new". */
export function isMomentUnseen(m: Moment, seenUntil: string | null): boolean {
  if (m.isOwn) return false;
  if (!seenUntil) return true;
  return new Date(m.createdAt).getTime() > new Date(seenUntil).getTime();
}

/**
 * Friends appearing in the loaded feed (not me), most recent first, for the
 * filter row: avatar + an "unseen" ring when they posted something new.
 */
export function feedPeople(moments: Moment[], meId: string | null, seenUntil: string | null): MomentPerson[] {
  const byId = new Map<string, MomentPerson>();
  for (const m of moments) {
    const unseen = isMomentUnseen(m, seenUntil);
    for (const p of momentPeople(m)) {
      if (p.userId === meId) continue;
      const cur = byId.get(p.userId);
      if (!cur) byId.set(p.userId, { ...p, latestAt: m.createdAt, unseen });
      else {
        if (m.createdAt > cur.latestAt) cur.latestAt = m.createdAt;
        cur.unseen ||= unseen;
      }
    }
  }
  return [...byId.values()].sort((a, b) => (a.latestAt < b.latestAt ? 1 : -1));
}

/** Moments kept by a filter ("me" = I posted or I'm in it; a person = they're in it). */
export function filterMoments(moments: Moment[], filter: MomentFilter, meId: string | null): Moment[] {
  if (filter === "all") return moments;
  const who = filter === "me" ? meId : filter.userId;
  if (!who) return moments;
  return moments.filter((m) => momentPeople(m).some((p) => p.userId === who));
}

/** Newer of two ISO timestamps (null-safe) — advancing the "seen until" mark. */
export function laterIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

/**
 * Small picture for a moment tile (Gallery "Recent moments"): single → its small
 * thumbnail; duo / trio → the first filled slot's. null = nothing to show.
 */
export function momentCover(m: Moment): string | null {
  if (m.template === "single") return m.missingMedia ? null : (m.thumbSmallUrl ?? m.thumbnailUrl ?? null);
  const slot = [...m.slots].sort((a, b) => a.slotIndex - b.slotIndex).find((s) => s.filled && s.thumbnailUrl);
  return slot?.thumbnailUrl ?? null;
}

/** A moment has at most 3 photos (trio template). */
export const MOMENT_MAX_PHOTOS = 3;

/**
 * Every picture of a moment tile, stacked like the card: single → its cover;
 * duo / trio → each slot in order (null = deleted / empty), at most 3.
 */
export function momentPictures(m: Moment): (string | null)[] {
  if (m.template === "single") return [momentCover(m)];
  return [...m.slots]
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .slice(0, MOMENT_MAX_PHOTOS)
    .map((s) => (s.missing || !s.mediaId ? null : s.thumbnailUrl));
}
