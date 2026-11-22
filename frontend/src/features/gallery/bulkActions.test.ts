import { describe, expect, it } from "vitest";
import { createAlbumsService, createMediaService, type HttpClient } from "@tng/shared";

describe("bulk media actions", () => {
  it("sends more than 100 ids in chunks of ≤ 100 (backend limit)", async () => {
    const bodies: { path: string; ids: string[] }[] = [];
    const http = {
      post: async (path: string, body: { ids: string[] }) => {
        bodies.push({ path, ids: body.ids });
      },
    } as unknown as HttpClient;
    const ids = Array.from({ length: 250 }, (_, i) => `id${i}`);
    await createMediaService(http).moveToTrash(ids);
    expect(bodies.map((b) => b.ids.length)).toEqual([100, 100, 50]);
    expect(bodies.flatMap((b) => b.ids)).toEqual(ids);
    expect(new Set(bodies.map((b) => b.path))).toEqual(new Set(["/gallery/media/trash"]));
  });

  it("album add sums the per-chunk counts", async () => {
    const sizes: number[] = [];
    const http = {
      post: async (_path: string, body: { mediaIds: string[] }) => {
        sizes.push(body.mediaIds.length);
        return { added: body.mediaIds.length };
      },
    } as unknown as HttpClient;
    const ids = Array.from({ length: 701 }, (_, i) => `id${i}`);
    expect(await createAlbumsService(http).addAlbumMedia("a1", ids)).toEqual({ added: 701 });
    expect(Math.max(...sizes)).toBeLessThanOrEqual(100);
  });
});
