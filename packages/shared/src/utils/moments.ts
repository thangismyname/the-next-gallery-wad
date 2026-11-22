// Moments feed helpers shared by web + mobile (pure, no React / storage).
import type { Moment, MomentFraming, MomentSlot } from "../types";

/** Moment card picture = 3:4 portrait (height ÷ width) — not Locket's square. */
export const MOMENT_ASPECT = 4 / 3;

/** Default framing: centred, no zoom. */
export const DEFAULT_FRAMING: MomentFraming = { x: 0.5, y: 0.5, zoom: 1 };
export const FRAMING_MAX_ZOOM = 3;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Drag a photo inside its frame by (dx, dy) px. With object-cover the photo overflows the frame on
 * one axis (+ the zoom on both): x / y run 0–1 across that overflow, so dragging right lowers x.
 * Exact at zoom 1, close enough above (the preview uses the same CSS as the card, so it's WYSIWYG).
 */
export function panFraming(
  f: MomentFraming,
  dx: number,
  dy: number,
  box: { frameW: number; frameH: number; imgW: number; imgH: number },
): MomentFraming {
  const cover = Math.max(box.frameW / box.imgW, box.frameH / box.imgH);
  const spanX = box.imgW * cover - box.frameW + box.frameW * (f.zoom - 1);
  const spanY = box.imgH * cover - box.frameH + box.frameH * (f.zoom - 1);
  return {
    ...f,
    x: spanX >= 1 ? clamp01(f.x - dx / spanX) : f.x,
    y: spanY >= 1 ? clamp01(f.y - dy / spanY) : f.y,
  };
}

export const zoomFraming = (f: MomentFraming, zoom: number): MomentFraming => ({
  ...f,
  zoom: Math.min(FRAMING_MAX_ZOOM, Math.max(1, Math.round(zoom * 100) / 100)),
});

/**
 * Where the photo / video ends up inside a frame, in px — exactly what the web CSS does
 * (object-fit cover + object-position x y + scale(zoom) around the same point). For platforms
 * without object-position (React Native video): position an element with this rect.
 */
export function framingRect(
  f: MomentFraming | null | undefined,
  frame: { width: number; height: number },
  media: { width: number; height: number },
): { left: number; top: number; width: number; height: number } {
  const { x, y, zoom } = f ?? DEFAULT_FRAMING;
  const cover = Math.max(frame.width / media.width, frame.height / media.height);
  const w = media.width * cover;
  const h = media.height * cover;
  const ox = x * frame.width;
  const oy = y * frame.height;
  return {
    left: ox + zoom * ((frame.width - w) * x - ox),
    top: oy + zoom * ((frame.height - h) * y - oy),
    width: w * zoom,
    height: h * zoom,
  };
}

/**
 * One frame of the card in a framing editor, top → bottom: number = index into my photos
 * (editable) · `{ src, framing }` = someone else's photo (read-only) · null = empty frame.
 */
export type FramerCell = number | { src: string; framing?: MomentFraming | null } | null;

/**
 * Filling an invitation: `picked[slot]` = index of my photo placed in that empty slot of mine;
 * slots others already filled show their photo; other empty slots = null.
 */
export function fillLayout(slots: MomentSlot[], picked: Record<number, number>): FramerCell[] {
  return [...slots]
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .map((slot) => {
      if (slot.slotIndex in picked) return picked[slot.slotIndex];
      const src = slot.filled ? (slot.displayUrl ?? slot.thumbnailUrl) : null;
      return src ? { src, framing: slot.framing } : null;
    });
}

/**
 * Creating a moment: `cells[i]` = my media id in frame i (null = free / a friend's).
 * Toggle `id`: remove it, or put it in the first free frame (limit 1 = replace, same frame).
 */
export function toggleInCells(cells: (string | null)[], id: string, slotCount: number, limit: number): (string | null)[] {
  const next = Array.from({ length: slotCount }, (_, i) => cells[i] ?? null);
  const at = next.indexOf(id);
  if (at >= 0) {
    next[at] = null;
    return next;
  }
  const count = next.filter(Boolean).length;
  if (limit === 1 && count >= 1) {
    next[next.findIndex(Boolean)] = id;
    return next;
  }
  const free = next.indexOf(null);
  if (count >= limit || free < 0) return cells;
  next[free] = id;
  return next;
}

/** Move the photo in frame `from` to frame `to` (swap when `to` has one). */
export function moveInCells(cells: (string | null)[], from: number, to: number, slotCount: number): (string | null)[] {
  if (to < 0 || to >= slotCount || from < 0 || from >= slotCount) return cells;
  const next = Array.from({ length: slotCount }, (_, i) => cells[i] ?? null);
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Untouched (centred, zoom 1) → null, so nothing is stored for it. */
export const framingOrNull = (f: MomentFraming | null | undefined): MomentFraming | null =>
  !f || (f.zoom === 1 && f.x === 0.5 && f.y === 0.5) ? null : f;

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
