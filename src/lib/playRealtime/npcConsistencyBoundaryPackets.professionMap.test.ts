import assert from "node:assert/strict";
import test from "node:test";
import { buildNpcConsistencyBoundaryCompactBlock } from "./npcConsistencyBoundaryPackets";

test("npcConsistencyBoundary compact block contains profession_certifier_map", () => {
  const result = buildNpcConsistencyBoundaryCompactBlock({
    playerContext: "用户位置[B1_PowerRoom]。附近NPC[N-008@B1_PowerRoom]。",
    latestUserInput: "你好",
    playerLocation: "B1_PowerRoom",
    focusNpcId: "N-008",
    maxRevealRank: 3,
    epistemic: { totalFacts: 0, usedFacts: 0, cappedFacts: 0, anomalyCount: 0 },
    maxChars: 4000,
  });
  const text = result.text;
  assert.ok(text.includes("profession_certifier_map"), "block should include profession certifier map key");
  assert.ok(text.includes("守灯人"), "should include 守灯人 profession");
  assert.ok(text.includes("溯源师"), "should include 溯源师 profession");
});
