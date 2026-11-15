import { create } from "zustand";
import { persist } from "zustand/middleware";
import { laterIso } from "@tng/shared";

/**
 * "Seen until" mark of the Moments feed (localStorage `tng.momentsSeenUntil`):
 * friends' moments created after it get a "New" badge / ring. Viewing a card
 * moves the mark forward; the feed keeps the value it opened with so badges
 * don't vanish while scrolling (mobile: same idea with AsyncStorage).
 */
export const useMomentsSeen = create<{ seenUntil: string | null; markSeen: (iso: string) => void }>()(
  persist(
    (set) => ({
      seenUntil: null,
      markSeen: (iso) => set((s) => ({ seenUntil: laterIso(s.seenUntil, iso) })),
    }),
    { name: "tng.momentsSeenUntil" },
  ),
);
