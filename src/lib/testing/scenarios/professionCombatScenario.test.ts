/**
 * 场景测试：职业与战斗系统
 *
 * 覆盖：
 * - 职业对战斗评分的加成
 * - 职业倾向与冲突类型匹配
 * - 职业主动技能加成
 * - 无职业时的基线评分
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createTestWeapon, createTestStats } from "@/lib/testing/fixtures";
import { computePlayerCombatScore } from "@/lib/combat/playerCombatScore";
import { computeProfessionState, computeBehaviorEvidenceKeys } from "@/lib/profession/engine";
import type { ProfessionId } from "@/lib/profession/types";

// ── 职业战斗加成 ──────────────────────────────────────────────────

test("combat: certified profession adds base bonus", () => {
  const weapon = createTestWeapon({ id: "W-TEST-001", tier: "C" });

  const scoreNoProfession = computePlayerCombatScore({
    stats: createTestStats(),
    equippedWeapon: weapon,
    threatPhase: "idle",
  });
  const scoreWithProfession = computePlayerCombatScore({
    stats: createTestStats(),
    equippedWeapon: weapon,
    threatPhase: "idle",
    profession: "守灯人" as ProfessionId,
  });
  // 已认证职业应有额外加成
  assert.ok(scoreWithProfession.score >= scoreNoProfession.score,
    `职业应提升得分: ${scoreNoProfession.score} → ${scoreWithProfession.score}`);
});

test("combat: profession affinity matches kind gives extra bonus", () => {
  const weapon = createTestWeapon({ id: "W-TEST-001", tier: "C" });

  // 守灯人对 subdue/weapon_clash/protect 有亲和力
  const scoreAffinity = computePlayerCombatScore({
    stats: createTestStats(),
    equippedWeapon: weapon,
    threatPhase: "idle",
    profession: "守灯人" as ProfessionId,
    kind: "subdue",
  });
  const scoreNoAffinity = computePlayerCombatScore({
    stats: createTestStats(),
    equippedWeapon: weapon,
    threatPhase: "idle",
    profession: "守灯人" as ProfessionId,
    kind: "escape", // 守灯人对 escape 无亲和力
  });
  assert.ok(scoreAffinity.score >= scoreNoAffinity.score,
    `亲和力匹配应提升得分: ${scoreNoAffinity.score} → ${scoreAffinity.score}`);
});

test("combat: active skill engagement adds bonus", () => {
  const weapon = createTestWeapon({ id: "W-TEST-001", tier: "C" });

  const scoreNoActive = computePlayerCombatScore({
    stats: createTestStats(),
    equippedWeapon: weapon,
    threatPhase: "idle",
    profession: "守灯人" as ProfessionId,
    professionActiveEngaged: false,
  });
  const scoreWithActive = computePlayerCombatScore({
    stats: createTestStats(),
    equippedWeapon: weapon,
    threatPhase: "idle",
    profession: "守灯人" as ProfessionId,
    professionActiveEngaged: true,
  });
  assert.ok(scoreWithActive.score > scoreNoActive.score,
    `主动技能应提升得分: ${scoreNoActive.score} → ${scoreWithActive.score}`);
});

// ── 职业行为证据不重复 ──────────────────────────────────────────

test("profession: behavior evidence keys are unique", () => {
  const evidence = computeBehaviorEvidenceKeys(
    "觅兆者" as ProfessionId,
    {
      tasks: [],
      historicalMaxFloorScore: 0,
      mainThreatByFloor: {},
      codex: {},
      inventoryCount: 0,
      warehouseCount: 0,
      equippedWeapon: null,
    }
  );
  // 不应有重复键（觅兆者的 omen_validation 应只出现一次）
  const unique = new Set(evidence);
  assert.equal(unique.size, evidence.length, `觅兆者证据键不应重复: ${evidence.join(", ")}`);
});

// ── 职业状态计算 ──────────────────────────────────────────────────

test("profession: computeProfessionState with no prior state", () => {
  const state = computeProfessionState({
    prev: undefined,
    stats: { sanity: 20, agility: 15, luck: 10, charm: 10, background: 10 },
    tasks: [],
    historicalMaxFloorScore: 0,
    mainThreatByFloor: {},
    codexUpdates: [],
    worldFlags: [],
    relationshipEdges: [],
    currentProfession: null,
    professionFlags: [],
  });
  assert.ok(state, "应返回有效的职业状态");
  assert.equal(state.currentProfession, null, "初始状态无职业");
});

// ── 战斗评分在合法范围内 ──────────────────────────────────────────

test("combat: player score stays within [0, 60]", () => {
  const weapon = createTestWeapon({ id: "W-TEST-001", tier: "S", stability: 100, contamination: 0 });

  const score = computePlayerCombatScore({
    stats: { sanity: 30, agility: 30, luck: 20, charm: 20, background: 20 },
    equippedWeapon: weapon,
    threatPhase: "idle",
    knowsWeakness: true,
    allyCount: 3,
    initiative: "hard",
    profession: "守灯人" as ProfessionId,
    professionActiveEngaged: true,
    kind: "subdue",
    opponentVulnerableTags: ["silence"],
  });
  assert.ok(score.score >= 0, `得分应 ≥ 0: ${score.score}`);
  assert.ok(score.score <= 60, `得分应 ≤ 60: ${score.score}`);
});
