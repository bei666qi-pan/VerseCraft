/**
 * 跨系统组合场景测试：武器 ↔ 职业 ↔ 战斗
 *
 * 覆盖：
 * - 不同职业装备不同武器的战斗评分差异
 * - 武器克制标签与职业倾向的叠加效果
 * - 转职前后的评分变化（受限于单职业制，主要测试职业切换后的状态）
 * - 边界条件：无武器、无职业、满属性
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createTestWeapon, createTestStats } from "@/lib/testing/fixtures";
import { computePlayerCombatScore } from "@/lib/combat/playerCombatScore";
import type { ProfessionId } from "@/lib/profession/types";

// ── 武器+职业组合评分 ─────────────────────────────────────────────

test("combo: weapon tier × profession bonus (守灯人 with S-tier)", () => {
  const weaponS = createTestWeapon({ id: "W-S-001", tier: "S", stability: 90, contamination: 0 });

  const noProf = computePlayerCombatScore({
    stats: createTestStats({ agility: 15 }),
    equippedWeapon: weaponS,
    threatPhase: "idle",
  });
  const withProf = computePlayerCombatScore({
    stats: createTestStats({ agility: 15 }),
    equippedWeapon: weaponS,
    threatPhase: "idle",
    profession: "守灯人" as ProfessionId,
    kind: "subdue",
  });
  assert.ok(withProf.score > noProf.score, "职业+高阶武器应显著提升得分");
  assert.ok(noProf.score >= 0 && noProf.score <= 60);
  assert.ok(withProf.score >= 0 && withProf.score <= 60);
});

test("combo: weapon counter tags match opponent vulnerability", () => {
  // 镜背匕 counterTags 含 "mirror"，弱点含 "mirror" 的敌人应对此武器有加成
  const weaponMirror = createTestWeapon({
    id: "WPN-003",
    tier: "C",
    counterTags: ["mirror", "direction"],
    currentMods: [],
  });

  const withoutMatch = computePlayerCombatScore({
    stats: createTestStats(),
    equippedWeapon: weaponMirror,
    threatPhase: "idle",
    opponentVulnerableTags: ["sound"], // 不匹配
  });
  const withMatch = computePlayerCombatScore({
    stats: createTestStats(),
    equippedWeapon: weaponMirror,
    threatPhase: "idle",
    opponentVulnerableTags: ["mirror"], // 匹配
  });
  assert.ok(withMatch.score > withoutMatch.score,
    `武器克制应提升得分: ${withoutMatch.score} → ${withMatch.score}`);
});

test("combo: weapon mod 'silent' matches vulnerability tag 'silence' after normalize", () => {
  const weapon = createTestWeapon({
    id: "W-TEST-SILENT",
    tier: "C",
    currentMods: ["silent"],
    counterTags: [],
  });

  const noMatch = computePlayerCombatScore({
    stats: createTestStats(),
    equippedWeapon: weapon,
    threatPhase: "idle",
    opponentVulnerableTags: ["sound"],
  });
  const withMatch = computePlayerCombatScore({
    stats: createTestStats(),
    equippedWeapon: weapon,
    threatPhase: "idle",
    opponentVulnerableTags: ["silence"], // 应匹配 "silent" → "silence"
  });
  assert.ok(withMatch.score > noMatch.score,
    `silent 模组应匹配 silence 弱点: ${noMatch.score} → ${withMatch.score}`);
});

// ── 边界条件 ──────────────────────────────────────────────────────

test("combo: no weapon + no profession still produces valid score", () => {
  const score = computePlayerCombatScore({
    stats: createTestStats(),
    equippedWeapon: null,
    threatPhase: "idle",
  });
  assert.ok(score.score >= 0 && score.score <= 60);
  assert.ok(score.breakdown.notes.length > 0, "无武器应有提示");
});

test("combo: max stats capped at 60 total score", () => {
  const weapon = createTestWeapon({ id: "W-MAX", tier: "S", stability: 100, contamination: 0 });

  // 极限输入：全属性 30 + S 武器 + 所有加成
  const score = computePlayerCombatScore({
    stats: { sanity: 30, agility: 30, luck: 30, charm: 30, background: 30 },
    equippedWeapon: weapon,
    threatPhase: "breached",
    knowsWeakness: true,
    allyCount: 3,
    initiative: "hard",
    profession: "守灯人" as ProfessionId,
    professionActiveEngaged: true,
    kind: "subdue",
    opponentVulnerableTags: ["silence", "mirror"],
    footingQuality: "good",
  });
  assert.ok(score.score <= 60, `极限输入得分不应超过 60: ${score.score}`);
  assert.ok(score.score > 25, `极限输入应远高于基础分: ${score.score}`);
});

test("combo: min stats (all 1) still produces non-negative score", () => {
  const score = computePlayerCombatScore({
    stats: { sanity: 1, agility: 1, luck: 1, charm: 1, background: 1 },
    equippedWeapon: createTestWeapon({ id: "W-BAD", stability: 0, contamination: 100, repairable: false, tier: "C" }),
    threatPhase: "breached",
    footingQuality: "bad",
  });
  assert.ok(score.score >= 0, `最低分不应低于 0: ${score.score}`);
});

// ── 所有 5 职业 × 武器组合 ───────────────────────────────────────

const ALL_PROFESSIONS: ProfessionId[] = ["守灯人", "巡迹客", "觅兆者", "齐日角", "溯源师"];

test("combo: all 5 professions produce valid scores with weapon", () => {
  const weapon = createTestWeapon({ id: "W-TEST", tier: "C" });
  for (const prof of ALL_PROFESSIONS) {
    const score = computePlayerCombatScore({
      stats: createTestStats(),
      equippedWeapon: weapon,
      threatPhase: "idle",
      profession: prof,
    });
    assert.ok(score.score >= 0 && score.score <= 60, `${prof} 得分应在 [0,60]: ${score.score}`);
  }
});

test("combo: all 5 professions with active skill produce higher scores", () => {
  const weapon = createTestWeapon({ id: "W-TEST", tier: "C" });
  for (const prof of ALL_PROFESSIONS) {
    const without = computePlayerCombatScore({
      stats: createTestStats(),
      equippedWeapon: weapon,
      threatPhase: "idle",
      profession: prof,
      professionActiveEngaged: false,
    });
    const withActive = computePlayerCombatScore({
      stats: createTestStats(),
      equippedWeapon: weapon,
      threatPhase: "idle",
      profession: prof,
      professionActiveEngaged: true,
    });
    assert.ok(withActive.score >= without.score,
      `${prof} 主动技能应不降低得分: ${without.score} → ${withActive.score}`);
  }
});

// ── 职业倾向匹配 ─────────────────────────────────────────────────

test("combo: 守灯人 gets affinity bonus for subdue/weapon_clash/protect", () => {
  const weapon = createTestWeapon({ id: "W-TEST", tier: "C" });
  const base = computePlayerCombatScore({
    stats: createTestStats(),
    equippedWeapon: weapon,
    threatPhase: "idle",
    profession: "守灯人" as ProfessionId,
    kind: "escape", // 无亲和力
  });
  const affinityKinds = ["subdue", "weapon_clash", "protect"] as const;
  for (const kind of affinityKinds) {
    const score = computePlayerCombatScore({
      stats: createTestStats(),
      equippedWeapon: weapon,
      threatPhase: "idle",
      profession: "守灯人" as ProfessionId,
      kind,
    });
    assert.ok(score.score > base.score,
      `守灯人对 ${kind} 应有亲和力加成: ${base.score} → ${score.score}`);
  }
});

test("combo: 巡迹客 gets affinity bonus only for escape", () => {
  const weapon = createTestWeapon({ id: "W-TEST", tier: "C" });
  const base = computePlayerCombatScore({
    stats: createTestStats(),
    equippedWeapon: weapon,
    threatPhase: "idle",
    profession: "巡迹客" as ProfessionId,
    kind: "weapon_clash",
  });
  const escape = computePlayerCombatScore({
    stats: createTestStats(),
    equippedWeapon: weapon,
    threatPhase: "idle",
    profession: "巡迹客" as ProfessionId,
    kind: "escape",
  });
  assert.ok(escape.score > base.score,
    `巡迹客对 escape 应有亲和力加成: ${base.score} → ${escape.score}`);
});
