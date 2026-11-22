import { describe, expect, it } from "vitest";
import { createSwipeReviewStore, type MediaListItem } from "@tng/shared";

const photo = (id: string) => ({ id, mediaType: "photo", url: "", thumbnailUrl: "", isFavorite: false, aiTags: [] }) as unknown as MediaListItem;

/** Fake server: a list where trashed ids disappear from paging. */
function fakeServer(n: number, { failTrash = false } = {}) {
  const all = Array.from({ length: n }, (_, i) => photo(`m${i}`));
  const trashed = new Set<string>();
  const favorites = new Set<string>();
  const offsets: number[] = [];
  return {
    trashed,
    favorites,
    offsets,
    api: {
      fetchMedia: async (offset: number, limit: number) => {
        offsets.push(offset);
        const live = all.filter((m) => !trashed.has(m.id));
        const items = live.slice(offset, offset + limit);
        return { items, hasMore: offset + limit < live.length, limit, offset };
      },
      moveToTrash: async (ids: string[]) => {
        if (failTrash) throw new Error("boom");
        ids.forEach((id) => trashed.add(id));
      },
      restoreMedia: async (ids: string[]) => {
        ids.forEach((id) => trashed.delete(id));
      },
      setFavorite: async (ids: string[], favorite: boolean) => {
        ids.forEach((id) => (favorite ? favorites.add(id) : favorites.delete(id)));
      },
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("swipe review store", () => {
  it("pages with offset = loaded − trashed, so no photo is skipped", async () => {
    const server = fakeServer(120);
    const store = createSwipeReviewStore(server.api);
    await store.getState().start();
    for (let i = 0; i < 45; i++) store.getState().decide(i % 3 === 0 ? "trash" : "keep");
    await flush();
    await flush();
    // 45 decided, 15 trashed → second page starts at 50 − 15 = 35 (= m50 in the live list).
    expect(server.offsets).toEqual([0, 35]);
    const ids = store.getState().items.map((m) => m.id);
    expect(ids.slice(0, 100)).toEqual(Array.from({ length: 100 }, (_, i) => `m${i}`));
    expect(server.trashed.size).toBe(15);
  });

  it("undo restores a trashed photo and shows it again", async () => {
    const server = fakeServer(5);
    const store = createSwipeReviewStore(server.api);
    await store.getState().start();
    store.getState().decide("trash");
    await flush();
    expect(server.trashed.has("m0")).toBe(true);
    store.getState().undo();
    await flush();
    expect(server.trashed.size).toBe(0);
    const s = store.getState();
    expect(s.decisions).toHaveLength(0);
    expect(s.items[s.decisions.length].id).toBe("m0");
  });

  it("swipe up hearts the photo and undo un-hearts it", async () => {
    const server = fakeServer(5);
    const store = createSwipeReviewStore(server.api);
    await store.getState().start();
    store.getState().decide("favorite");
    await flush();
    expect(server.favorites.has("m0")).toBe(true);
    expect(store.getState().items[1].id).toBe("m1");
    store.getState().undo();
    await flush();
    expect(server.favorites.size).toBe(0);
  });

  it("a failed trash is recorded as kept", async () => {
    const server = fakeServer(5, { failTrash: true });
    const store = createSwipeReviewStore(server.api);
    await store.getState().start();
    store.getState().decide("trash");
    await flush();
    const s = store.getState();
    expect(s.writeErrors).toBe(1);
    expect(s.decisions[0].action).toBe("keep");
  });
});
