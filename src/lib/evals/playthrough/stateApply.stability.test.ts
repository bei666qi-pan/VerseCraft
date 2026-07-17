import assert from "node:assert/strict";
import test from "node:test";
import { createInitialStateSnapshot } from "./invariants";
import { applyDmJsonToState } from "./stateApply";

test("mixed consume/award is atomic and duplicate set-like deltas do not grow state", () => {
  const initial = createInitialStateSnapshot({
    inventoryItemCount: 3,
    activeTaskIds: ["TASK-A"],
    codexNpcIds: ["N-001"],
  });
  const next = applyDmJsonToState(initial, {
    sanity_damage: Number.NaN,
    consumed_items: ["old"],
    awarded_items: [{ id: "new" }],
    new_tasks: [{ task_id: "TASK-A" }, { task_id: "TASK-A" }],
    codex_updates: [{ entry_id: "N-001" }, { entry_id: "N-001" }],
  }, "");
  assert.equal(next.inventoryItemCount, 3);
  assert.equal(next.sanity, initial.sanity);
  assert.deepEqual(next.activeTaskIds, ["TASK-A"]);
  assert.deepEqual(next.codexNpcIds, ["N-001"]);
});

test("numeric overflow is clamped and cannot produce negative resources", () => {
  const initial = createInitialStateSnapshot({ originium: 5, sanity: 10 });
  const next = applyDmJsonToState(initial, { currency_change: -999999, sanity_damage: 999999 }, "");
  assert.equal(next.originium, 0);
  assert.equal(next.sanity, 0);
});

test("harness applies the current codex id contract and keeps legacy entry_id", () => {
  const initial = createInitialStateSnapshot({ codexNpcIds: [] });
  const next = applyDmJsonToState(initial, { codex_updates: [{ id: "N-010" }, { entry_id: "N-001" }] }, "");
  assert.deepEqual(next.codexNpcIds, ["N-010", "N-001"]);
});

test("harness carries structured clue ids into the next client snapshot", () => {
  const initial = createInitialStateSnapshot({ journalClueIds: [] });
  const next = applyDmJsonToState(initial, { clue_updates: [{ id: "clue:a" }] }, "");
  assert.deepEqual(next.journalClueIds, ["clue:a"]);
});

test("harness recognizes the real ending_finale contract as terminal", () => {
  const initial = createInitialStateSnapshot();
  const next = applyDmJsonToState(initial, { ending_finale: { outcome: "true_escape", narrative: "final" } }, "final");
  assert.equal(next.reachedEnding, true);
});

test("harness keeps currentFloor aligned with player_location and initial overrides", () => {
  const initial = createInitialStateSnapshot({ playerLocation: "1F_Lobby" });
  assert.equal(initial.currentFloor, "1F");
  const moved = applyDmJsonToState(initial, { player_location: "B1_PowerRoom" }, "");
  assert.equal(moved.currentFloor, "B1");
});
