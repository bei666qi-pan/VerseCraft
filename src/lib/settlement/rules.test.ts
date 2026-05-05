import assert from "node:assert/strict";
import test from "node:test";
import {
  computeSettlementGrade,
  formatSettlementFloor,
  resolveSettlementFloorScore,
} from "./rules";

test("settlement grade forces death to E", () => {
  assert.equal(
    computeSettlementGrade({
      isDead: true,
      maxFloor: 8,
      killedAnomalies: 8,
      survivalHours: 120,
      escapeOutcome: "true_escape",
    }),
    "E"
  );
});

test("settlement grade awards S for completed escape", () => {
  assert.equal(
    computeSettlementGrade({
      isDead: false,
      maxFloor: 8,
      killedAnomalies: 0,
      survivalHours: 14,
      escapeOutcome: "costly_escape",
    }),
    "S"
  );
});

test("settlement grade uses floor, kills, and time thresholds", () => {
  assert.equal(computeSettlementGrade({ isDead: false, maxFloor: 7, killedAnomalies: 0, survivalHours: 10, escapeOutcome: "none" }), "A");
  assert.equal(computeSettlementGrade({ isDead: false, maxFloor: 5, killedAnomalies: 0, survivalHours: 10, escapeOutcome: "none" }), "B");
  assert.equal(computeSettlementGrade({ isDead: false, maxFloor: 3, killedAnomalies: 0, survivalHours: 10, escapeOutcome: "none" }), "C");
  assert.equal(computeSettlementGrade({ isDead: false, maxFloor: 0, killedAnomalies: 0, survivalHours: 14, escapeOutcome: "none" }), "D");
});

test("settlement floor display maps basement and normal floors", () => {
  assert.equal(resolveSettlementFloorScore("B1_SafeZone"), 0);
  assert.equal(resolveSettlementFloorScore("B2_Exit"), 8);
  assert.equal(resolveSettlementFloorScore("4F_Corridor"), 4);
  assert.equal(formatSettlementFloor(0), "地下一层");
  assert.equal(formatSettlementFloor(8), "地下二层");
  assert.equal(formatSettlementFloor(4), "第 4 层");
});
