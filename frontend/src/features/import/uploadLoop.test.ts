import { describe, expect, it } from "vitest";
import { HttpError, runUploadLoop } from "@tng/shared";

const fast = { rateLimitWaitMs: 5, retryWaitMs: 1 };

describe("runUploadLoop", () => {
  it("uploads everything in batches and counts duplicates", async () => {
    const sent: string[][] = [];
    const p = await runUploadLoop({
      ...fast,
      items: ["a", "b", "c", "d", "e"],
      batchSize: 2,
      prepare: async (x) => x,
      send: async (parts) => {
        sent.push(parts);
        return parts.map((x) => ({ duplicate: x === "c" }));
      },
    });
    expect(p).toEqual({ total: 5, done: 5, duplicates: 1, failed: 0 });
    expect(sent.flat().sort()).toEqual(["a", "b", "c", "d", "e"]);
    expect(Math.max(...sent.map((b) => b.length))).toBe(2);
  });

  it("a rejected batch is split; only the bad file fails", async () => {
    const failures: [string, string][] = [];
    const p = await runUploadLoop({
      ...fast,
      items: ["ok1", "bad", "ok2"],
      batchSize: 3,
      prepare: async (x) => x,
      send: async (parts) => {
        if (parts.includes("bad")) throw new HttpError(400, "bad file");
        return parts.map(() => ({}));
      },
      onFailure: (item, reason) => failures.push([item, reason]),
    });
    expect(p).toMatchObject({ done: 2, failed: 1 });
    expect(failures).toEqual([["bad", "badFile"]]);
  });

  it("429 pauses and retries; network errors retry then fail; unreadable files fail", async () => {
    let limited = false;
    const failures: [string, string][] = [];
    const p = await runUploadLoop({
      ...fast,
      items: ["x", "net", "broken"],
      batchSize: 1,
      concurrency: 1,
      retries: 1,
      prepare: async (x) => {
        if (x === "broken") throw new Error("cannot read");
        return x;
      },
      send: async (parts) => {
        if (parts[0] === "x" && !limited) {
          limited = true;
          throw new HttpError(429, "slow down");
        }
        if (parts[0] === "net") throw new TypeError("Network request failed");
        return [{}];
      },
      onFailure: (item, reason) => failures.push([item, reason]),
    });
    expect(p).toMatchObject({ done: 1, failed: 2 });
    expect(failures.sort()).toEqual([["broken", "unreadable"], ["net", "network"]]);
  });

  it("stops on abort", async () => {
    const controller = new AbortController();
    let calls = 0;
    const p = await runUploadLoop({
      ...fast,
      items: ["a", "b", "c"],
      batchSize: 1,
      concurrency: 1,
      signal: controller.signal,
      prepare: async (x) => x,
      send: async () => {
        calls += 1;
        controller.abort();
        return [{}];
      },
    });
    expect(calls).toBe(1);
    expect(p.done).toBe(1);
  });
});
