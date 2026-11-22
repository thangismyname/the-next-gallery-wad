import { test } from "node:test";
import assert from "node:assert/strict";

import { createJobQueue } from "./jobQueue.js";

const tick = () => new Promise((r) => setTimeout(r, 5));

test("jobQueue: never runs more than `concurrency` jobs and serves fast before bulk", async () => {
  const order = [];
  let active = 0;
  let peak = 0;
  const q = createJobQueue({
    concurrency: 2,
    run: async (job) => {
      active += 1;
      peak = Math.max(peak, active);
      order.push(job);
      await tick();
      active -= 1;
    },
  });
  q.push("b1", "bulk");
  q.push("b2", "bulk");
  q.push("b3", "bulk");
  q.push("f1");
  q.push("f2");
  while (q.stats().running || q.stats().fast || q.stats().bulk) await tick();
  assert.equal(peak, 2);
  // b1, b2 started first (queue was empty); then both fast jobs jump ahead of b3.
  assert.deepEqual(order, ["b1", "b2", "f1", "f2", "b3"]);
});

test("jobQueue: errors go to onError and the queue keeps going; full queue drops", async () => {
  const errors = [];
  const done = [];
  const q = createJobQueue({
    concurrency: 1,
    maxPending: 2,
    run: async (job) => {
      await tick();
      if (job === "bad") throw new Error("x");
      done.push(job);
    },
    onError: (_err, job) => errors.push(job),
  });
  assert.equal(q.push("bad"), true); // starts right away, not pending
  assert.equal(q.push("a"), true);
  assert.equal(q.push("b"), true);
  assert.equal(q.push("c"), false);
  while (q.stats().running || q.stats().fast) await tick();
  assert.deepEqual(errors, ["bad"]);
  assert.deepEqual(done, ["a", "b"]);
});
