import test from "node:test";
import assert from "node:assert/strict";
import { detectConflictLikelihood } from "./combatPromptBlock";

test("detectConflictLikelihood: combat verbs -> likely", () => {
  const out = detectConflictLikelihood({
    lastUserInput: "我拔刀冲过去按住他，别让他跑了",
    locationId: "2F_Corridor",
    mainThreatByFloor: {},
    npcHeartViews: [],
  });
  assert.equal(out.likely, true);
});

test("detectConflictLikelihood: calm input in B1 idle -> not likely", () => {
  const out = detectConflictLikelihood({
    lastUserInput: "我低声问他规则是什么",
    locationId: "B1_SafeZone",
    mainThreatByFloor: { B1: { floorId: "B1", phase: "idle" } } as any,
    npcHeartViews: [],
  });
  // 允许 false：避免每回合都注入战斗块
  assert.equal(out.likely, false);
});

