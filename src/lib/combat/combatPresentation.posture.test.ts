import test from "node:test";
import assert from "node:assert/strict";
import {
  outcomeToResultLayer,
  resultLayerToPlayerText,
  verdictToPostureTier,
  postureTierToThreatSense,
} from "./combatPresentation";

test("verdict maps to hidden posture tier", () => {
  assert.equal(verdictToPostureTier("favorable"), "upper_hand");
  assert.equal(verdictToPostureTier("contested"), "contested");
  assert.equal(verdictToPostureTier("risky"), "under_pressure");
  assert.equal(verdictToPostureTier("avoid"), "collapse_risk");
});

test("outcome maps to layered conflict result", () => {
  assert.equal(outcomeToResultLayer("advantage"), "suppress_success");
  assert.equal(outcomeToResultLayer("forced_retreat"), "narrow_pushback");
  assert.equal(outcomeToResultLayer("mutual_damage"), "mutual_bruise");
  assert.equal(outcomeToResultLayer("pressured"), "forced_withdraw");
  assert.equal(outcomeToResultLayer("collapse"), "runaway_collapse");
  assert.ok(resultLayerToPlayerText("suppress_success").includes("压制成功"));
  assert.ok(postureTierToThreatSense("under_pressure").length > 0);
});

