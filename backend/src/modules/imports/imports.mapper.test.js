import { test } from "node:test";
import assert from "node:assert/strict";

import { toImportSession } from "./imports.mapper.js";
import { updateImportSchema } from "./imports.schema.js";

test("toImportSession: counts from session media + client-reported parts", () => {
  const dto = toImportSession({
    id: "s1",
    source: "takeout",
    client: "web",
    status: "done",
    plan: { media: 5 },
    skipped_existing: 1,
    failures: [{ path: "a.jpg", reason: "badFile" }],
    imported: "3",
    duplicates: "0",
    started_at: "t0",
    finished_at: null,
  });
  assert.deepEqual(dto.counts, { imported: 3, duplicates: 0, skippedExisting: 1, failed: 1 });
  assert.equal(dto.finishedAt, null);
});

test("updateImportSchema: rejects empty updates and unknown reasons", () => {
  assert.equal(updateImportSchema.safeParse({}).success, false);
  assert.equal(updateImportSchema.safeParse({ failures: [{ path: "a", reason: "x" }] }).success, false);
  assert.equal(updateImportSchema.safeParse({ status: "done", skippedExisting: 2 }).success, true);
});
