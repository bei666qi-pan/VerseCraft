import test from "node:test";
import assert from "node:assert/strict";
import { applyProfessionNarrativeCoherenceGuard } from "./professionNarrativeCoherenceGuard";

test("repairs an incoherent profession-technique subject without changing state", () => {
  const input = { narrative: "我将烛台的陌生人从掌心逼到铁管表面。", weapon_updates: [{ weaponId: "W-1" }] };
  const result = applyProfessionNarrativeCoherenceGuard(input);
  assert.equal(result.narrative, "我将守灯人的专注从掌心逼到铁管表面。");
  assert.deepEqual(result.weapon_updates, input.weapon_updates);
  assert.deepEqual(result._commit_flags, ["profession_prose_coherence_repaired_v1"]);
});

test("keeps ordinary references to strangers", () => {
  const input = { narrative: "烛台旁的陌生人没有开口。" };
  assert.equal(applyProfessionNarrativeCoherenceGuard(input), input);
});
