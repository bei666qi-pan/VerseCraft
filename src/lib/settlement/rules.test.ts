import assert from "node:assert/strict";
import test from "node:test";
import {
  computeSettlementGrade,
  formatSettlementFloor,
  getSettlementGradeCaption,
  getSettlementOutcomeLead,
  resolveSettlementFloorScore,
} from "./rules";

test("settlement grade keeps death in E/D range", () => {
  assert.equal(
    computeSettlementGrade({
      isDead: true,
      maxFloor: 1,
      killedAnomalies: 0,
      survivalHours: 4,
      escapeOutcome: "true_escape",
    }),
    "E"
  );
  assert.equal(
    computeSettlementGrade({
      isDead: true,
      maxFloor: 7,
      killedAnomalies: 3,
      survivalHours: 80,
      escapeOutcome: "death",
    }),
    "D"
  );
});

test("settlement grade awards outcome-aware escape tiers", () => {
  assert.equal(
    computeSettlementGrade({
      isDead: false,
      maxFloor: 8,
      killedAnomalies: 0,
      survivalHours: 14,
      escapeOutcome: "true_escape",
    }),
    "S"
  );
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
  assert.equal(
    computeSettlementGrade({
      isDead: false,
      maxFloor: 3,
      killedAnomalies: 0,
      survivalHours: 14,
      escapeOutcome: "costly_escape",
    }),
    "A"
  );
  assert.equal(
    computeSettlementGrade({
      isDead: false,
      maxFloor: 3,
      killedAnomalies: 0,
      survivalHours: 14,
      escapeOutcome: "false_escape",
    }),
    "B"
  );
  assert.equal(
    computeSettlementGrade({
      isDead: false,
      maxFloor: 7,
      killedAnomalies: 0,
      survivalHours: 14,
      escapeOutcome: "false_escape",
    }),
    "A"
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

test("settlement captions describe terminal outcomes", () => {
  assert.match(getSettlementGradeCaption("S", "true_escape"), /真正的出口/);
  assert.match(getSettlementGradeCaption("A", "costly_escape"), /代价/);
  assert.match(getSettlementGradeCaption("B", "false_escape"), /循环/);
  assert.match(getSettlementGradeCaption("E", "death"), /死亡/);
  assert.match(getSettlementOutcomeLead("doom"), /第十日/);
});
