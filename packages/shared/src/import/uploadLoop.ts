// Retrying batch uploader for imports — pure (the actual request + file reading are injected),
// shared by web and mobile.
import { HttpError } from "../http";
import type { ImportFailureReason } from "../services/imports";

export interface UploadLoopProgress {
  total: number;
  /** Uploaded (new or duplicate). */
  done: number;
  /** Of `done`: same content as a photo already in the library (no new copy). */
  duplicates: number;
  failed: number;
}

export interface UploadLoopOptions<T, P> {
  items: T[];
  /** Read one file into what `send` needs (web File, RN `{ uri, name, type }`). Throw = unreadable. */
  prepare: (item: T) => Promise<P>;
  /** One request with these files; returns one result per file, same order. */
  send: (parts: P[], items: T[], signal: AbortSignal) => Promise<{ duplicate?: boolean }[]>;
  onProgress?: (progress: UploadLoopProgress) => void;
  onFailure?: (item: T, reason: ImportFailureReason) => void;
  signal?: AbortSignal;
  /** Files per request (backend takes ≤ 20). */
  batchSize?: number;
  /** Requests in flight. */
  concurrency?: number;
  /** Extra attempts after a network / 5xx error. */
  retries?: number;
  /** Pause after 429 before going on. */
  rateLimitWaitMs?: number;
  /** Pause after a network error before the retry. */
  retryWaitMs?: number;
}

interface Job<T> {
  item: T;
  tries: number;
  /** Its batch was rejected (4xx) → send it alone to find the bad file. */
  single: boolean;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (ms <= 0 || signal?.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });

/**
 * Upload `items` in batches with `concurrency` requests at once:
 * 429 → everyone pauses, the batch goes back to the front · other 4xx → retry each file alone,
 * a file rejected alone = `badFile` · network / 5xx → retry up to `retries` times, then `network`
 * · `prepare` throws → `unreadable`. Resolves when every item is done or failed, or on abort.
 */
export async function runUploadLoop<T, P>(o: UploadLoopOptions<T, P>): Promise<UploadLoopProgress> {
  const {
    batchSize = 8,
    concurrency = 2,
    retries = 2,
    rateLimitWaitMs = 20_000,
    retryWaitMs = 3_000,
    signal,
  } = o;
  const queue: Job<T>[] = o.items.map((item) => ({ item, tries: 0, single: false }));
  const progress: UploadLoopProgress = { total: o.items.length, done: 0, duplicates: 0, failed: 0 };
  let inFlight = 0;
  let pausedUntil = 0;

  const fail = (item: T, reason: ImportFailureReason) => {
    progress.failed += 1;
    o.onFailure?.(item, reason);
  };
  const take = (): Job<T>[] => {
    if (!queue.length) return [];
    if (queue[0].single) return [queue.shift()!];
    const batch: Job<T>[] = [];
    while (batch.length < batchSize && queue.length && !queue[0].single) batch.push(queue.shift()!);
    return batch;
  };

  const worker = async () => {
    for (;;) {
      if (signal?.aborted) return;
      await sleep(pausedUntil - Date.now(), signal);
      const batch = take();
      if (!batch.length) {
        // Others may still put jobs back (retry / split) — only stop when nothing is in flight.
        if (inFlight === 0) return;
        await sleep(100, signal);
        continue;
      }
      inFlight += 1;
      try {
        const ready: { job: Job<T>; part: P }[] = [];
        for (const job of batch) {
          try {
            ready.push({ job, part: await o.prepare(job.item) });
          } catch {
            fail(job.item, "unreadable");
          }
        }
        if (!ready.length) continue;
        const controller = new AbortController();
        const onAbort = () => controller.abort();
        signal?.addEventListener("abort", onAbort);
        try {
          const results = await o.send(
            ready.map((r) => r.part),
            ready.map((r) => r.job.item),
            controller.signal,
          );
          for (const [i] of ready.entries()) {
            progress.done += 1;
            if (results[i]?.duplicate) progress.duplicates += 1;
          }
        } catch (err) {
          if (signal?.aborted) return;
          const status = err instanceof HttpError ? err.status : 0;
          if (status === 429) {
            pausedUntil = Date.now() + rateLimitWaitMs;
            queue.unshift(...ready.map((r) => r.job));
          } else if (status >= 400 && status < 500) {
            if (ready.length > 1) queue.unshift(...ready.map((r) => ({ ...r.job, single: true })));
            else fail(ready[0].job.item, "badFile");
          } else {
            for (const { job } of ready) {
              if (job.tries < retries) queue.push({ ...job, tries: job.tries + 1 });
              else fail(job.item, "network");
            }
            await sleep(retryWaitMs, signal);
          }
        } finally {
          signal?.removeEventListener("abort", onAbort);
        }
      } finally {
        inFlight -= 1;
        o.onProgress?.({ ...progress });
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  return { ...progress };
}
