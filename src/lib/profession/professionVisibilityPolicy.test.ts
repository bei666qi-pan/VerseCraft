import test from "node:test";
import assert from "node:assert/strict";
import { computeProfessionVisibility } from "./professionVisibilityPolicy";
import type { ProfessionProgress, ProfessionStateV1 } from "./types";

function progress(overrides: Partial<ProfessionProgress> = {}): ProfessionProgress {
  return {
    statQualified: false,
    behaviorQualified: false,
    behaviorEvidenceCount: 0,
    behaviorEvidenceTarget: 2,
    trialTaskId: null,
    trialTaskCompleted: false,
    certified: false,
    ...overrides,
  };
}

function baseState(overrides: Partial<Record<"守灯人" | "巡迹客" | "觅兆者" | "齐日角" | "溯源师", ProfessionProgress>>): ProfessionStateV1 {
  return {
    currentProfession: null,
    unlockedProfessions: [],
    eligibilityByProfession: { 守灯人: false, 巡迹客: false, 觅兆者: false, 齐日角: false, 溯源师: false },
    progressByProfession: {
      守灯人: progress(),
      巡迹客: progress(),
      觅兆者: progress(),
      齐日角: progress(),
      溯源师: progress(),
      ...overrides,
    },
    activePerks: [],
    professionFlags: {},
    professionCooldowns: {},
  };
}

// 修复：旧实现按 PROFESSION_IDS 固定顺序（守灯人/巡迹客/觅兆者/齐日角/溯源师）取前 2 个满足条件的职业，
// 与玩家实际投入无关——即使溯源师的证据/试炼进度明显领先，只要守灯人/巡迹客也“刚好达标属性门槛”，
// 展示的永远是数组里靠前的两个。
test("computeProfessionVisibility: 按“更接近认证”排序，而不是固定注册表顺序", () => {
  const state = baseState({
    守灯人: progress({ statQualified: true, inclinationVisible: true, behaviorEvidenceCount: 0 }),
    巡迹客: progress({ statQualified: true, inclinationVisible: true, behaviorEvidenceCount: 0 }),
    溯源师: progress({
      statQualified: true,
      behaviorEvidenceCount: 2,
      observedByCertifier: true,
      trialOffered: true,
    }),
  });
  const vis = computeProfessionVisibility(state);
  assert.ok(vis.visibleProfessions.includes("溯源师"), "溯源师投入明显更多却没有优先展示");
  assert.equal(vis.visibleProfessions.length, 2);
});

test("computeProfessionVisibility: 已认证职业只展示自己", () => {
  const state = baseState({});
  state.currentProfession = "齐日角";
  const vis = computeProfessionVisibility(state);
  assert.deepEqual(vis.visibleProfessions, ["齐日角"]);
});

test("computeProfessionVisibility: 无任何倾向时返回空列表", () => {
  const state = baseState({});
  const vis = computeProfessionVisibility(state);
  assert.deepEqual(vis.visibleProfessions, []);
});
