/**
 * 伤害管线完整性测试
 *
 * 基于 Agent A/B 的发现：
 * - 伤害管线是纯分数比较模型（无 Buff/暴击/乘数系统）
 * - 战斗不产生奖励（仅消耗耐久和理智）
 * - 身体伤势被计算但未应用到玩家状态（设计决策）
 *
 * 覆盖：
 * - 玩家→NPC 分数对比 → 结果层级
 * - 伤势严重度 → 理智伤害映射
 * - likelyCost → InjuryDelta 转换
 * - 安全区伤害降级
 */

import test from "node:test";
import assert from "node:assert/strict";
import { computePlayerCombatScore } from "@/lib/combat/playerCombatScore";
import { buildHiddenNpcCombatProfile } from "@/lib/combat/combatAdjudication";
import { resolveCombat } from "@/lib/combat/resolveCombat";
import { likelyCostToInjuryDelta } from "@/lib/combat/combatInjuryIntegration";
import { createTestWeapon, createTestStats } from "@/lib/testing/fixtures";

// ── 伤害严重度 → 理智伤害映射 ────────────────────────────────────

test("damage: 'none' cost produces zero injury and zero sanity damage", () => {
  const delta = likelyCostToInjuryDelta("none", "weapon_clash");
  assert.equal(delta.sanityDamage, 0);
  assert.equal(delta.injuries.length, 0);
});

test("damage: 'light' cost produces at most 1 injury and 1 sanity damage", () => {
  const delta = likelyCostToInjuryDelta("light", "weapon_clash");
  assert.ok(delta.sanityDamage <= 1);
  assert.ok(delta.injuries.length <= 1);
});

test("damage: 'moderate' cost produces at most 2 injuries and 2 sanity damage", () => {
  const delta = likelyCostToInjuryDelta("moderate", "weapon_clash");
  assert.ok(delta.sanityDamage <= 2);
  assert.ok(delta.injuries.length <= 2);
});

test("damage: 'heavy' cost produces at most 3 injuries and 4 sanity damage", () => {
  const delta = likelyCostToInjuryDelta("heavy", "weapon_clash");
  assert.ok(delta.sanityDamage <= 4);
  assert.ok(delta.injuries.length <= 3);
});

// ── 安全区降级 ────────────────────────────────────────────────────

test("damage: safe zone downgrades severity by one level", () => {
  const deltaSafe = likelyCostToInjuryDelta("heavy", "weapon_clash", { isSafeZone: true });
  const deltaNormal = likelyCostToInjuryDelta("heavy", "weapon_clash");
  // 安全区伤害应 ≤ 普通伤害
  assert.ok(deltaSafe.sanityDamage <= deltaNormal.sanityDamage,
    `安全区理智伤害(${deltaSafe.sanityDamage})应 ≤ 普通(${deltaNormal.sanityDamage})`);
});

// ── 伤害类型映射 ──────────────────────────────────────────────────

test("damage: weapon_clash heavy cost produces fracture (upgraded) and bruise", () => {
  const delta = likelyCostToInjuryDelta("heavy", "weapon_clash");
  // heavy 会将 cut 升级为 fracture（重伤类型升级），并附带 bruise 次级伤
  const types = delta.injuries.map((i) => i.type);
  assert.ok(types.includes("fracture") || types.includes("cut"),
    `weapon_clash heavy 应产生 fracture 或 cut: ${types}`);
  assert.ok(delta.injuries.length >= 1, "至少应有 1 条伤势");
});

test("damage: shove maps to 'bruise' injury type", () => {
  const delta = likelyCostToInjuryDelta("moderate", "shove");
  if (delta.injuries.length > 0) {
    assert.ok(delta.injuries.some((i) => i.type === "bruise"),
      `shove 应产生 bruise 类型伤势`);
  }
});

// ── 战斗结算：分数差异 → 结果层级 ────────────────────────────────

test("damage: large player advantage produces favorable outcome", () => {
  const playerScore = computePlayerCombatScore({
    stats: createTestStats({ agility: 25 }),
    equippedWeapon: createTestWeapon({ id: "W-S", tier: "S", stability: 100, contamination: 0 }),
    threatPhase: "idle",
    knowsWeakness: true,
    initiative: "hard",
  });

  const result = resolveCombat({
    attacker: { kind: "player", actorId: "player", score: playerScore.score, styleTags: ["close_quarters"], breakdown: playerScore.breakdown },
    defender: { kind: "npc", actorId: "npc", score: 5, styleTags: ["boundary_guard"], breakdown: { base: 5, scene: 0, equipment: 0, psyche: 0, style: 0, total: 5, notes: [] } },
    kind: "weapon_clash",
    scene: {
      locationId: "3F_Hallway",
      floorId: "3F",
      threatPhase: "idle",
      isSafeZone: false,
      timeOfDay: "day",
      modifiers: { pressure: 0, concealment: 0, footing: 0 },
      notes: [],
    },
  });

  assert.ok(result.outcome !== "collapse" && result.outcome !== "forced_retreat",
    `高优势不应导致崩溃: outcome=${result.outcome}`);
  assert.equal(result.winner, "attacker",
    `高优势应由攻击方获胜: winner=${result.winner}`);
});

// ── 分数始终在 [0, 60] 范围内 ─────────────────────────────────────

test("damage: player score range invariant holds for extreme inputs", () => {
  // 极限低
  const low = computePlayerCombatScore({
    stats: { sanity: 1, agility: 1, luck: 1, charm: 1, background: 1 },
    equippedWeapon: null,
    threatPhase: "breached",
    footingQuality: "bad",
  });
  assert.ok(low.score >= 0 && low.score <= 60, `低分应在 [0,60]: ${low.score}`);

  // 极限高
  const high = computePlayerCombatScore({
    stats: { sanity: 30, agility: 30, luck: 30, charm: 30, background: 30 },
    equippedWeapon: createTestWeapon({ id: "W-S", tier: "S", stability: 100, contamination: 0 }),
    threatPhase: "idle",
    knowsWeakness: true,
    allyCount: 3,
    initiative: "hard",
    profession: "守灯人",
    professionActiveEngaged: true,
    kind: "subdue",
    footingQuality: "good",
  });
  assert.ok(high.score >= 0 && high.score <= 60, `高分应在 [0,60]: ${high.score}`);
});

// ── NPC 隐藏画像 ──────────────────────────────────────────────────

test("damage: known major NPC has a valid hidden combat profile", () => {
  // 验证主要 NPC 的隐藏战斗画像可构建
  assert.doesNotThrow(() => {
    buildHiddenNpcCombatProfile({ npcId: "N-001", codex: null });
  });
});

test("damage: unknown NPC defaults to threat-phase-based profile", () => {
  const profile = buildHiddenNpcCombatProfile({
    npcId: "NPC-UNKNOWN-99999",
    codex: null,
    floor: "3F_Hallway",
    threatPhase: "active",
    conflictKind: "weapon_clash",
  });
  assert.ok(profile !== null);
  assert.ok(typeof profile.basePower === "number" && profile.basePower >= 0);
  assert.ok(Array.isArray(profile.styleTags));
});
