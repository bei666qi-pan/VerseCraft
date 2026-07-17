import assert from "node:assert/strict";
import test from "node:test";
import { assessCounterfactualChoice } from "./counterfactualChoice";

const initial = { sanity: 80, equippedWeapon: "W", weaponStability: 72, weaponContamination: 0, playerLocation: "3F", activeThreatIds: ["A"] };

test("same-state attack vs recon is meaningful only when structured outcomes diverge", () => {
  const attack = { initialState: initial, steps: [{ playerAction: "攻击", dmJson: { weapon_updates: [{ weaponId: "W", stability: 68 }], conflict_outcome: { outcomeTier: "partial" } }, stateSnapshot: { sanity: 79, weaponStability: 68, weaponContamination: 1, playerLocation: "3F" } }] };
  const recon = { initialState: { ...initial }, steps: [{ playerAction: "侦察", dmJson: { weapon_updates: [], conflict_outcome: null }, stateSnapshot: { sanity: 80, weaponStability: 72, weaponContamination: 0, playerLocation: "3F" } }] };
  const result = assessCounterfactualChoice(attack, recon);
  assert.equal(result.meaningfulChoice, true);
  assert.deepEqual(result.reasons, ["same_initial_state", "actions_differ", "structured_outcomes_differ"]);
});

test("different prose without state/delta divergence is cosmetic only", () => {
  const a = { initialState: initial, steps: [{ playerAction: "左", dmJson: {}, stateSnapshot: { playerLocation: "3F" } }] };
  const b = { initialState: initial, steps: [{ playerAction: "右", dmJson: {}, stateSnapshot: { playerLocation: "3F" } }] };
  assert.equal(assessCounterfactualChoice(a, b).meaningfulChoice, false);
  assert.ok(assessCounterfactualChoice(a, b).reasons.includes("cosmetic_only_outcomes"));
});
