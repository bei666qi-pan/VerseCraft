import test from "node:test";
import assert from "node:assert/strict";
import { computeProfessionState, certifyProfession } from "./engine";
import { createDefaultProfessionState } from "./registry";

test("profession eligibility follows stat + behavior gates", () => {
  const state = computeProfessionState({
    prev: createDefaultProfessionState(),
    stats: { sanity: 22, agility: 5, luck: 5, charm: 5, background: 5 },
    tasks: [{ id: "a", status: "completed" }, { id: "b", status: "completed" }, { id: "prof_trial_lampkeeper", status: "completed" }],
    historicalMaxFloorScore: 1,
    mainThreatByFloor: {
      "1": { floorId: "1", threatId: "A-001", phase: "suppressed", suppressionProgress: 100, lastResolvedAtHour: 1, counterHintsUsed: [] },
    },
    codex: {},
    inventoryCount: 1,
    warehouseCount: 0,
    equippedWeapon: null,
  });
  assert.equal(state.eligibilityByProfession["守灯人"], true);
  assert.equal(state.eligibilityByProfession["巡迹客"], false);
});

test("certify profession sets current and perk", () => {
  const computed = computeProfessionState({
    prev: createDefaultProfessionState(),
    stats: { sanity: 25, agility: 1, luck: 1, charm: 1, background: 1 },
    tasks: [{ id: "a", status: "completed" }, { id: "b", status: "completed" }, { id: "prof_trial_lampkeeper", status: "completed" }],
    historicalMaxFloorScore: 1,
    mainThreatByFloor: {
      "1": { floorId: "1", threatId: "A-001", phase: "suppressed", suppressionProgress: 100, lastResolvedAtHour: 1, counterHintsUsed: [] },
    },
    codex: {},
    inventoryCount: 1,
    warehouseCount: 0,
    equippedWeapon: null,
  });
  const next = certifyProfession(computed, "守灯人");
  assert.equal(next.currentProfession, "守灯人");
  assert.equal(next.activePerks.length, 1);
});

