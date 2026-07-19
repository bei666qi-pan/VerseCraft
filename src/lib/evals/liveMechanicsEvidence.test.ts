import assert from "node:assert/strict";
import test from "node:test";
import { buildLiveMechanicsChecks, LIVE_MECHANIC_SCENARIOS } from "./liveMechanicsEvidence";

const passingState = {
  equippedWeapon: "WPN-3F-IRON-PIPE",
  weaponStability: 68,
  activeTaskIds: ["t_delivery_letter_b1"],
  completedTaskIds: ["prof_trial_lampkeeper", "t_delivery_letter_b1"],
  inventoryItemIds: [],
  latestDmJson: {
    task_updates: [{ id: "t_delivery_letter_b1", status: "completed" }],
    consumed_items: ["I-B08"],
  },
};

test("live mechanics evidence derives scenarios from real run ids and requires every scenario", () => {
  const runs = LIVE_MECHANIC_SCENARIOS.map((scenario) => ({
    runId: `${scenario}-speedrunner-seed1`,
    finalState: scenario === "recovery-weapon-repair"
      ? { ...passingState, weaponStability: 35 }
      : scenario === "quest-delivery-missing-item"
        ? {
            ...passingState,
            completedTaskIds: ["prof_trial_lampkeeper"],
            latestDmJson: {
              task_updates: [],
              consumed_items: [],
              awarded_items: [],
              consumes_time: false,
              narrative: "挂号信并不在身上，不能凭空取出信件或完成任务。",
            },
          }
        : passingState,
  }));
  const result = buildLiveMechanicsChecks(runs);
  assert.deepEqual(result.mechanics, {
    "weapon-lifecycle": true,
    "profession-progression": true,
    "quest-lifecycle": true,
    "quest-delivery-missing-item": true,
    "combat-survival": true,
    "recovery-weapon-repair": true,
  });
  assert.equal(Object.values(result.checksByRun).every(Boolean), true);
});

test("live mechanics evidence fails closed for missing scenario coverage or unknown run ids", () => {
  assert.throws(() => buildLiveMechanicsChecks([{ runId: "weapon-lifecycle-speedrunner-seed1", finalState: passingState }]));
  assert.throws(() => buildLiveMechanicsChecks([{ runId: "unlabelled-run", finalState: passingState }]));
});
