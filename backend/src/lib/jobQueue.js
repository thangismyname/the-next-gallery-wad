/**
 * In-process job queue with a concurrency cap and two lanes: `fast` (interactive uploads) is always
 * served before `bulk` (imports). Jobs are plain data; `run(job)` errors are passed to `onError`.
 * Not persisted — whatever is pending at shutdown is picked up later by the AI backfills.
 */
export function createJobQueue({ concurrency, run, maxPending = 100_000, onError = () => {} }) {
  const lanes = { fast: [], bulk: [] };
  let running = 0;

  const pump = () => {
    while (running < concurrency) {
      const job = lanes.fast.shift() ?? lanes.bulk.shift();
      if (!job) return;
      running += 1;
      Promise.resolve()
        .then(() => run(job))
        .catch((err) => onError(err, job))
        .finally(() => {
          running -= 1;
          pump();
        });
    }
  };

  return {
    /** false = queue full (job dropped — a backfill will catch it). */
    push(job, lane = "fast") {
      if (lanes.fast.length + lanes.bulk.length >= maxPending) return false;
      lanes[lane === "bulk" ? "bulk" : "fast"].push(job);
      pump();
      return true;
    },
    stats: () => ({ running, fast: lanes.fast.length, bulk: lanes.bulk.length }),
  };
}
