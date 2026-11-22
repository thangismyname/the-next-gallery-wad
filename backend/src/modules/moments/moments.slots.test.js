import { test } from "node:test";
import assert from "node:assert/strict";
import { friendSlotPlan } from "./moments.collab.service.js";

test("friends get the slots the creator left free, in order", () => {
  // trio, creator picked the middle slot, 1 friend → top + bottom.
  assert.deepEqual(friendSlotPlan(3, [1], ["a"]), [
    { slotIndex: 0, userId: "a" },
    { slotIndex: 2, userId: "a" },
  ]);
  // trio, creator bottom, 2 friends → one slot each from the top.
  assert.deepEqual(friendSlotPlan(3, [2], ["a", "b"]), [
    { slotIndex: 0, userId: "a" },
    { slotIndex: 1, userId: "b" },
  ]);
  // duo, creator default first slot.
  assert.deepEqual(friendSlotPlan(2, [0], ["a"]), [{ slotIndex: 1, userId: "a" }]);
});
