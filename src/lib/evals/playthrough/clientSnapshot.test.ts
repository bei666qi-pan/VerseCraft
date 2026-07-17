import assert from "node:assert/strict";
import test from "node:test";
import { buildClientStructuredSnapshot } from "./orchestrator";
import { createInitialStateSnapshot } from "./invariants";
import { findScenario } from "./scenarios";
import { applyDmJsonToState } from "./stateApply";

test("live smoke snapshot carries the same structured weapon/profession/task fields as the full harness", () => {
  const scenario = findScenario("profession-combat-synergy");
  assert.ok(scenario);
  const state = createInitialStateSnapshot(scenario!.initialStateOverride);
  const snapshot = buildClientStructuredSnapshot(state);
  assert.equal(snapshot.currentProfession, "守灯人");
  assert.equal(snapshot.equippedWeapon, null);
  assert.equal((snapshot.weaponBag as unknown[]).length, 1);
  assert.deepEqual(snapshot.activeTaskIds, ["prof_trial_lampkeeper"]);
  assert.deepEqual(snapshot.presentNpcIds, []);
});

test("forge deltas update bag contents and remove consumed material ids from the next snapshot", () => {
  const state = createInitialStateSnapshot({
    inventoryItemIds: ["item_phone", "I-C03"],
    inventoryItemCount: 2,
    warehouseItemIds: ["W-B101"],
    equippedWeapon: "WPN-3F-IRON-PIPE",
    weaponBag: [{ id: "WPN-3F-IRON-PIPE", name: "三楼消防铁管", stability: 55, contamination: 8, repairable: true }],
  });
  const next = applyDmJsonToState(state, {
    consumed_items: ["I-C03", "W-B101"],
    currency_change: -1,
    weapon_updates: [{ weaponId: "WPN-3F-IRON-PIPE", stability: 85, contamination: 0, repairable: true }],
  }, "完成维护");
  assert.deepEqual(next.inventoryItemIds, ["item_phone"]);
  assert.deepEqual(next.warehouseItemIds, []);
  assert.equal(next.weaponBag[0]?.stability, 85);
  assert.equal(next.weaponBag[0]?.contamination, 0);
});
