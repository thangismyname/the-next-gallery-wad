// shared/stores/swipeReview.ts — "Swipe to clean" queue (web `features/review`, mobile `features/review`).
import { create } from "zustand";

import type { MediaListItem, MediaPage } from "../services/media";

/** favorite = heart it and move on (swipe up); counts as kept. */
export type SwipeAction = "trash" | "keep" | "favorite";
export interface SwipeDecision {
  item: MediaListItem;
  action: SwipeAction;
}

export interface SwipeReviewApi {
  fetchMedia: (offset: number, limit: number) => Promise<MediaPage>;
  moveToTrash: (ids: string[]) => Promise<void>;
  restoreMedia: (ids: string[]) => Promise<void>;
  setFavorite: (ids: string[], favorite: boolean) => Promise<void>;
}

export interface SwipeReviewState {
  /** Every loaded item, newest first; the current card = `items[decisions.length]`. */
  items: MediaListItem[];
  decisions: SwipeDecision[];
  hasMore: boolean;
  loading: boolean;
  loadFailed: boolean;
  /** Bumped when a trash / restore request fails (UI shows a toast). */
  writeErrors: number;
  start: () => Promise<void>;
  loadMore: () => Promise<void>;
  decide: (action: SwipeAction) => void;
  undo: () => void;
}

const PAGE = 50;
const PREFETCH = 10;

/**
 * Swipe left = move to trash (soft delete, restorable), right = keep, up = favorite; undo reverts the last one.
 * Writes run one after another and page loads wait for them: trashed items leave the server list,
 * so the next offset = loaded − trashed (an undo landing after a load would skip a photo otherwise).
 */
export function createSwipeReviewStore(api: SwipeReviewApi) {
  let writes: Promise<unknown> = Promise.resolve();
  let generation = 0;

  return create<SwipeReviewState>((set, get) => {
    const write = (run: () => Promise<void>, onFail: () => void) => {
      const gen = generation;
      writes = writes.then(run).catch(() => {
        if (gen !== generation) return;
        onFail();
        set((s) => ({ writeErrors: s.writeErrors + 1 }));
      });
    };

    const trashedCount = () => get().decisions.filter((d) => d.action === "trash").length;

    return {
      items: [],
      decisions: [],
      hasMore: true,
      loading: false,
      loadFailed: false,
      writeErrors: 0,

      start: async () => {
        generation += 1;
        set({ items: [], decisions: [], hasMore: true, loading: false, loadFailed: false, writeErrors: 0 });
        await get().loadMore();
      },

      loadMore: async () => {
        if (get().loading || !get().hasMore) return;
        const gen = generation;
        set({ loading: true, loadFailed: false });
        try {
          // Wait for every write, including ones queued while waiting, before reading the offset.
          for (let w = writes; ; w = writes) {
            await w;
            if (w === writes) break;
          }
          const page = await api.fetchMedia(get().items.length - trashedCount(), PAGE);
          if (gen !== generation) return;
          set((s) => {
            // New uploads shift the list by one → the same photo can come back; keep the first copy.
            const seen = new Set(s.items.map((m) => m.id));
            const fresh = page.items.filter((m) => !seen.has(m.id));
            return { items: [...s.items, ...fresh], hasMore: page.hasMore && page.items.length > 0, loading: false };
          });
        } catch {
          if (gen === generation) set({ loading: false, loadFailed: true });
        }
      },

      decide: (action) => {
        const { items, decisions } = get();
        const item = items[decisions.length];
        if (!item) return;
        set({ decisions: [...decisions, { item, action }] });
        if (action === "trash") {
          // Not trashed after all → record it as kept so counts and the next offset stay true.
          write(
            () => api.moveToTrash([item.id]),
            () =>
              set((s) => ({
                decisions: s.decisions.map((d) => (d.item.id === item.id ? { item, action: "keep" } : d)),
              })),
          );
        } else if (action === "favorite" && !item.isFavorite) {
          write(
            () => api.setFavorite([item.id], true),
            () =>
              set((s) => ({
                decisions: s.decisions.map((d) => (d.item.id === item.id ? { item, action: "keep" } : d)),
              })),
          );
        }
        const s = get();
        if (s.hasMore && s.items.length - s.decisions.length <= PREFETCH) void s.loadMore();
      },

      undo: () => {
        const { decisions } = get();
        const last = decisions[decisions.length - 1];
        if (!last) return;
        set({ decisions: decisions.slice(0, -1) });
        if (last.action === "trash") {
          // Restore failed: still in the trash → drop the card unless already re-decided (keeps items[i] = decisions[i]).
          write(
            () => api.restoreMedia([last.item.id]),
            () =>
              set((s) => ({
                items: s.items.filter((m) => m.id !== last.item.id || s.decisions.some((d) => d.item.id === m.id)),
              })),
          );
        } else if (last.action === "favorite" && !last.item.isFavorite) {
          // `item` keeps the state from load time: un-heart only photos this session hearted.
          write(() => api.setFavorite([last.item.id], false), () => {});
        }
      },
    };
  });
}
