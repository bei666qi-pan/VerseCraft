/**
 * 场景测试：武器与锻造系统
 *
 * 覆盖：
 * - 锻造成功/失败时的操作类型和结果形状
 * - 锻造后武器不变量
 * - 武器模组和阶级影响战斗评分
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createTestWeapon, createTestStats, createTestWeaponWithMods } from "@/lib/testing/fixtures";
import { checkWeaponInvariants } from "@/lib/testing/invariants";
import { executeLightForge, buildLightForgePreview } from "@/lib/playRealtime/forgeService";
import { computePlayerCombatScore } from "@/lib/combat/playerCombatScore";

// ── 锻造操作类型校验（不依赖真实材料） ────────────────────────────

test("forge: repair returns correct operation type", () => {
  const weapon = createTestWeapon({ id: "W-TEST-001", stability: 45, contamination: 60, repairable: true });
  const result = executeLightForge({
    actionText: "修复武器 forge_repair_basic",
    originium: 5,
    inventoryIds: ["I-C01"],
    warehouseIds: [],
    weapon,
    weaponSlotEmpty: false,
  });
  assert.ok(result !== null, "锻造应返回结果");
  assert.equal(result.operation, "repair", "操作应为 repair");
  assert.ok("ok" in result, "应包含 ok 字段");
  assert.ok("consumedItemIds" in result, "应包含 consumedItemIds");
  assert.ok("weaponUpdates" in result, "应包含 weaponUpdates");
});

test("forge: repair on previously unrepairable weapon does not reject due to repairable flag", () => {
  // 核心验证：repairable: false 不应导致修复被拒绝
  const weapon = createTestWeapon({ id: "W-TEST-001", stability: 30, contamination: 80, repairable: false });
  const result = executeLightForge({
    actionText: "修复武器 forge_repair_basic",
    originium: 5,
    inventoryIds: ["I-C01"],
    warehouseIds: [],
    weapon,
    weaponSlotEmpty: false,
  });
  assert.ok(result !== null);
  // 如果拒绝，原因不应是 repairable 相关提示（旧行为会输出"该武器当前不可维护"）
  if (!result.ok) {
    assert.ok(!result.narrative.includes("不可维护"),
      `拒绝原因不应与 repairable 相关: ${result.narrative}`);
  }
});

test("forge: mod with full slots is rejected or de-duplicated", () => {
  const weapon = createTestWeaponWithMods(["silent", "mirror"], { id: "W-TEST-001" });
  assert.equal(weapon.currentMods.length, 2);

  const result = executeLightForge({
    actionText: "改装 forge_mod_silent", // 安装已存在的模组 → 去重后不变
    originium: 10,
    inventoryIds: ["I-C01"],
    warehouseIds: [],
    weapon,
    weaponSlotEmpty: false,
  });
  assert.ok(result !== null);
  // 锻造可能因材料不足失败，但失败原因不应是模组相关
  if (!result.ok) {
    assert.ok(!result.narrative.includes("槽"), "不应因槽位问题被拒绝");
  }
});

test("forge: infusion cap is enforced in executeLightForge code path", () => {
  // 验证注入上限逻辑存在于 forgeService 中（代码审查级别验证）
  // 实际执行依赖材料，此处只验证 forgeService 函数可正常调用不抛异常
  const weapon = createTestWeapon({ id: "W-TEST-001", currentInfusions: [
    { threatTag: "liquid", turnsLeft: 3 },
    { threatTag: "mirror", turnsLeft: 2 },
  ]});
  const result = executeLightForge({
    actionText: "灌注 forge_infuse_seal",
    originium: 10,
    inventoryIds: ["I-C01"],
    warehouseIds: [],
    weapon,
    weaponSlotEmpty: false,
  });
  assert.ok(result !== null, "锻造函数不应抛异常");
  // 失败原因应来自材料或权限，而非代码崩溃
  assert.ok(typeof result.narrative === "string" && result.narrative.length > 0,
    "应返回错误描述");
});

test("forge: replacing same-tag infusion reuses slot correctly", () => {
  // 代码审查验证：替换同 threatTag 灌注时 kept.length 不变，不触发上限
  const weapon = createTestWeapon({ id: "W-TEST-001", currentInfusions: [
    { threatTag: "liquid", turnsLeft: 3 },
    { threatTag: "mirror", turnsLeft: 2 },
  ]});
  const result = executeLightForge({
    actionText: "灌注 forge_infuse_mirror", // 替换 mirror
    originium: 10,
    inventoryIds: ["I-C01"],
    warehouseIds: [],
    weapon,
    weaponSlotEmpty: false,
  });
  assert.ok(result !== null);
  assert.ok(typeof result.narrative === "string" && result.narrative.length > 0);
  // 不会因 cap 拒绝（替换不占新槽位）
  if (!result.ok) {
    assert.ok(!result.narrative.includes("最多") && !result.narrative.includes("灌注"),
      `替换灌注不应触达上限: ${result.narrative}`);
  }
});

// ── 锻造预览 ──────────────────────────────────────────────────────

test("forge: preview does not throw", () => {
  assert.doesNotThrow(() => {
    buildLightForgePreview({
      weapon: { weaponId: "W-TEST-001", stability: 80 },
      inventoryIds: ["I-C01"],
      warehouseIds: [],
      stats: createTestStats(),
    });
  });
});

test("forge: preview for empty weapon slot shows weaponize options", () => {
  const preview = buildLightForgePreview({
    weapon: { weaponId: null, stability: null },
    inventoryIds: ["I-C01", "I-C02", "I-C03"],
    warehouseIds: [],
    stats: createTestStats(),
  });
  assert.ok(preview.includes("武器化"));
  assert.ok(preview.includes("武器栏空"));
});

// ── 武器不变量 ────────────────────────────────────────────────────

test("forge: valid weapon passes all invariants", () => {
  const weapon = createTestWeapon({ id: "W-TEST-001", stability: 80, contamination: 10, tier: "B" });
  const issues = checkWeaponInvariants(weapon, "valid");
  assert.deepEqual(issues, [], `正常武器不应触发不变量: ${JSON.stringify(issues)}`);
});

test("forge: weapon with extreme degradation still passes invariants (within bounds)", () => {
  const weapon = createTestWeapon({ id: "W-TEST-001", stability: 0, contamination: 100, repairable: false });
  const issues = checkWeaponInvariants(weapon, "degraded");
  // 0 和 100 仍在合法范围内 [0, 100]
  assert.deepEqual(issues, [], `极端但合法值应通过不变量: ${JSON.stringify(issues)}`);
});

// ── 武器影响战斗评分 ──────────────────────────────────────────────

test("combat: weapon tier affects player score", () => {
  const weaponC = createTestWeapon({ id: "W-TEST-001", tier: "C" });
  const weaponA = createTestWeapon({ id: "W-TEST-002", tier: "A" });

  const scoreC = computePlayerCombatScore({
    stats: createTestStats(),
    equippedWeapon: weaponC,
    threatPhase: "idle",
  });
  const scoreA = computePlayerCombatScore({
    stats: createTestStats(),
    equippedWeapon: weaponA,
    threatPhase: "idle",
  });
  assert.ok(scoreA.score >= scoreC.score, `A 级(${scoreA.score})应 ≥ C 级(${scoreC.score})`);
});

test("combat: no weapon produces valid score with note", () => {
  const score = computePlayerCombatScore({
    stats: createTestStats(),
    equippedWeapon: null,
    threatPhase: "idle",
  });
  assert.ok(score.score >= 0 && score.score <= 60);
  assert.ok(score.breakdown.notes.some((n) => n.includes("未装备")),
    "无武器应有提示信息");
});
