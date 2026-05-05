import assert from "node:assert/strict";
import test from "node:test";
import { getAutoSaveSlotId, MAX_VISIBLE_SAVE_SLOTS, pruneVisibleSaveSlots } from "./slots";

function slot(updatedAt: string) {
  return { slotMeta: { updatedAt } };
}

test("pruneVisibleSaveSlots keeps five newest visible saves", () => {
  const slots = Object.fromEntries(
    Array.from({ length: 7 }, (_, index) => {
      const n = index + 1;
      return [`branch_${n}`, slot(`2026-05-0${n}T00:00:00.000Z`)];
    })
  );

  const pruned = pruneVisibleSaveSlots(slots);
  assert.equal(Object.keys(pruned).filter((id) => !id.startsWith("auto_")).length, MAX_VISIBLE_SAVE_SLOTS);
  assert.equal(pruned.branch_7 != null, true);
  assert.equal(pruned.branch_6 != null, true);
  assert.equal(pruned.branch_2, undefined);
  assert.equal(pruned.branch_1, undefined);
});

test("pruneVisibleSaveSlots removes auto slots with pruned parents", () => {
  const slots = {
    branch_1: slot("2026-05-01T00:00:00.000Z"),
    auto_branch_1: slot("2026-05-01T00:01:00.000Z"),
    branch_2: slot("2026-05-02T00:00:00.000Z"),
    auto_branch_2: slot("2026-05-02T00:01:00.000Z"),
  };

  const pruned = pruneVisibleSaveSlots(slots, { maxVisible: 1 });
  assert.deepEqual(Object.keys(pruned).sort(), ["auto_branch_2", "branch_2"]);
});

test("pruneVisibleSaveSlots can preserve an active visible slot", () => {
  const slots = {
    main_slot: slot("2026-05-01T00:00:00.000Z"),
    auto_main: slot("2026-05-01T00:01:00.000Z"),
    branch_2: slot("2026-05-02T00:00:00.000Z"),
    branch_3: slot("2026-05-03T00:00:00.000Z"),
  };

  const pruned = pruneVisibleSaveSlots(slots, { maxVisible: 2, keepSlotIds: ["main_slot"] });
  assert.equal(pruned.main_slot != null, true);
  assert.equal(pruned[getAutoSaveSlotId("main_slot")] != null, true);
  assert.equal(Object.keys(pruned).filter((id) => !id.startsWith("auto_")).length, 2);
});
