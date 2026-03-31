import test from "node:test";
import assert from "node:assert/strict";
import { computeWeaponLifecycleStages } from "./weaponLifecycle";

test("computeWeaponLifecycleStages should reflect maintenance when polluted", () => {
  const res = computeWeaponLifecycleStages({
    equippedWeapon: {
      id: "WZ-001",
      name: "测试武器",
      description: "",
      counterThreatIds: [],
      counterTags: [],
      stability: 45,
      calibratedThreatId: null,
      modSlots: ["core"],
      currentMods: [],
      currentInfusions: [],
      contamination: 80,
      repairable: true,
    } as any,
    inventory: [],
    originium: 0,
  });
  assert.ok(res.stages.includes("equipped"));
  assert.ok(res.stages.includes("unstable_or_polluted"));
  assert.ok(res.stages.includes("needs_maintenance"));
});

