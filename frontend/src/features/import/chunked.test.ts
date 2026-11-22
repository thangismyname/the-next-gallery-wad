import { describe, expect, it, vi } from "vitest";
import { CHUNKED_THRESHOLD, HttpError, uploadMixed, type ChunkIO, type HttpClient } from "@tng/shared";

type Part = { name: string; size: number };
const io: ChunkIO<Part> = {
  size: (p) => p.size,
  name: (p) => p.name,
  type: () => "video/quicktime",
  fingerprint: (p) => `${p.name}:${p.size}`,
  slice: async (_p, start, end) => ({ body: new Blob([new Uint8Array(end - start)]) }),
};

const MiB8 = 8 * 1024 * 1024;

/** Fake backend: keeps the offset per upload, can drop one chunk reply (lands but errors). */
function fakeHttp(opts: { dropReplyAt?: number; networkErrorAt?: number } = {}) {
  const offsets = new Map<string, number>();
  const calls: string[] = [];
  let dropped = false;
  let failed = false;
  const http = {
    post: vi.fn(async (path: string, body: any) => {
      calls.push(path);
      if (path === "/gallery/media/uploads") {
        const id = body.fingerprint;
        return { uploadId: id, offset: offsets.get(id) ?? 0, chunkSize: MiB8 };
      }
      return { uploaded: [{ duplicate: false, meta: body.meta }] };
    }),
    upload: vi.fn(async (path: string, form: FormData) => {
      calls.push(path.split("?")[0]);
      const m = /uploads\/(.+)\/chunk\?offset=(\d+)/.exec(path);
      if (!m) return { uploaded: (form.getAll("media") as File[]).map(() => ({ duplicate: true })) };
      const [, id, at] = m;
      const have = offsets.get(id) ?? 0;
      if (Number(at) !== have) throw new HttpError(409, "x", { payload: { error: { details: { offset: have } } } });
      if (opts.networkErrorAt === have && !failed) {
        failed = true;
        throw new HttpError(0, "Network error");
      }
      const next = have + (form.get("chunk") as Blob).size;
      offsets.set(id, next);
      if (opts.dropReplyAt === have && !dropped) {
        dropped = true;
        throw new HttpError(0, "reply lost");
      }
      return { offset: next };
    }),
  } as unknown as HttpClient;
  return { http, calls, offsets };
}

const big = (name: string, size = CHUNKED_THRESHOLD + 20): Part => ({ name, size });

describe("uploadMixed", () => {
  it("small files in one batch, big ones chunked, results in order", async () => {
    const { http, offsets } = fakeHttp();
    const sendBatch = vi.fn(async (parts: Part[]) => parts.map(() => ({ duplicate: true })));
    const res = await uploadMixed({
      http, io, sendBatch,
      parts: [{ name: "a.jpg", size: 10 }, big("v.mov"), { name: "b.jpg", size: 10 }],
      meta: [null, { bulk: true }, null],
    });
    expect(sendBatch).toHaveBeenCalledTimes(1);
    expect(sendBatch.mock.calls[0][0].map((p) => p.name)).toEqual(["a.jpg", "b.jpg"]);
    expect(res.map((r) => r.duplicate)).toEqual([true, false, true]);
    expect((res[1] as any).meta).toEqual({ bulk: true });
    expect(offsets.get(`v.mov:${CHUNKED_THRESHOLD + 20}`)).toBe(CHUNKED_THRESHOLD + 20);
  });

  it("keeps a big Live Photo pair in the batch and re-maps livePhotoOf", async () => {
    const { http } = fakeHttp();
    const sendBatch = vi.fn(async (parts: Part[], _meta: unknown[]) => parts.map(() => ({})));
    await uploadMixed({
      http, io, sendBatch,
      parts: [big("solo.mov"), { name: "p.heic", size: 10 }, big("p.mov")],
      meta: [null, null, { livePhotoOf: 1 }],
    });
    expect(sendBatch.mock.calls[0][0].map((p) => p.name)).toEqual(["p.heic", "p.mov"]);
    expect(sendBatch.mock.calls[0][1]).toEqual([null, { livePhotoOf: 0 }]);
  });

  it("resumes after a lost reply (409 → server offset) and a network error", async () => {
    const { http, offsets } = fakeHttp({ dropReplyAt: MiB8, networkErrorAt: 3 * MiB8 });
    vi.useFakeTimers();
    const run = uploadMixed({ http, io, sendBatch: async () => [], parts: [big("r.mov", CHUNKED_THRESHOLD + 50)], meta: [] });
    await vi.runAllTimersAsync();
    await run;
    vi.useRealTimers();
    expect(offsets.get(`r.mov:${CHUNKED_THRESHOLD + 50}`)).toBe(CHUNKED_THRESHOLD + 50);
  });
});
