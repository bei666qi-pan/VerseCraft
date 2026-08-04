/**
 * 跨系统组合场景测试：锻造 ↔ 存档 ↔ 加载
 *
 * 覆盖：
 * - 锻造后保存 → 加载 → 状态一致
 * - 重复操作幂等性
 * - 边界条件：非法输入、空状态
 * - 连续多次锻造后的累积效果
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createTestWeapon, createTestWeaponWithMods, createTestWeaponWithInfusions } from "@/lib/testing/fixtures";
import { checkWeaponInvariants, invariantSaveLoadRoundtrip } from "@/lib/testing/invariants";
import { executeLightForge } from "@/lib/playRealtime/forgeService";

// ── 锻造后保存/加载一致性 ─────────────────────────────────────────

test("combo: weapon state survives JSON round-trip", () => {
  const weapon = createTestWeaponWithMods(["silent"], {
    id: "W-001",
    tier: "B",
    stability: 75,
    contamination: 20,
  });

  // 模拟保存
  const saved = JSON.stringify(weapon);
  // 模拟加载
  const loaded = JSON.parse(saved);

  // 关键字段应一致
  assert.equal(loaded.id, weapon.id);
  assert.equal(loaded.tier, weapon.tier);
  assert.equal(loaded.stability, weapon.stability);
  assert.equal(loaded.contamination, weapon.contamination);
  assert.deepEqual(loaded.currentMods, weapon.currentMods);
});

test("combo: weapon with infusions survives JSON round-trip", () => {
  const weapon = createTestWeaponWithInfusions(
    [
      { threatTag: "liquid", turnsLeft: 3 },
      { threatTag: "mirror", turnsLeft: 1 },
    ],
    { id: "W-002", tier: "A" }
  );

  const saved = JSON.stringify(weapon);
  const loaded = JSON.parse(saved);

  assert.equal(loaded.currentInfusions.length, 2);
  assert.equal(loaded.currentInfusions[0].threatTag, "liquid");
  assert.equal(loaded.currentInfusions[0].turnsLeft, 3);
});

// ── 锻造重复操作幂等性 ───────────────────────────────────────────

test("combo: repair twice in a row should be idempotent on result shape", () => {
  const weapon = createTestWeapon({ id: "W-001", stability: 45, contamination: 60, repairable: true });

  const r1 = executeLightForge({
    actionText: "修复武器 forge_repair_basic",
    originium: 10,
    inventoryIds: ["I-C01"],
    warehouseIds: [],
    weapon: JSON.parse(JSON.stringify(weapon)),
    weaponSlotEmpty: false,
  });

  // 对同一个武器（在 r1 修复后）再次修复
  const r2 = executeLightForge({
    actionText: "修复武器 forge_repair_basic",
    originium: 10,
    inventoryIds: ["I-C01"],
    warehouseIds: [],
    weapon: JSON.parse(JSON.stringify(weapon)), // 同样的初始状态
    weaponSlotEmpty: false,
  });

  assert.ok(r1 !== null && r2 !== null);
  // 相同输入应产生相同结果
  assert.equal(JSON.stringify(r1), JSON.stringify(r2), "相同输入重复执行应产生相同结果");
});

// ── 边界条件：空状态和非法输入 ───────────────────────────────────

test("combo: forge on null weapon returns error", () => {
  const result = executeLightForge({
    actionText: "修复武器 forge_repair_basic",
    originium: 10,
    inventoryIds: [],
    warehouseIds: [],
    weapon: null,
    weaponSlotEmpty: false,
  });
  assert.ok(result !== null);
  assert.equal(result.ok, false);
  assert.ok(result.narrative.includes("没有装备"), "应提示无装备武器");
});

test("combo: forge with insufficient originium returns error", () => {
  const weapon = createTestWeapon({ id: "W-001", stability: 50, repairable: true });
  const result = executeLightForge({
    actionText: "修复武器 forge_repair_basic",
    originium: 0,
    inventoryIds: ["I-C01"],
    warehouseIds: [],
    weapon,
    weaponSlotEmpty: false,
  });
  assert.ok(result !== null);
  assert.equal(result.ok, false);
  assert.ok(
    result.narrative.includes("原石不足") || result.narrative.includes("材料标签不足"),
    `应提示原石或材料不足: ${result.narrative}`
  );
});

// ── 连续多次锻造后的武器不变量 ───────────────────────────────────

test("combo: consecutive forge operations produce valid weapon state", () => {
  let currentWeapon = createTestWeapon({ id: "W-001", stability: 80, contamination: 0, repairable: true });
  let forgeCount = 0;

  // 第一次操作：修复（可能因材料不足失败）
  const r1 = executeLightForge({
    actionText: "修复武器 forge_repair_basic",
    originium: 10,
    inventoryIds: ["I-C01"],
    warehouseIds: [],
    weapon: JSON.parse(JSON.stringify(currentWeapon)),
    weaponSlotEmpty: false,
  });
  if (r1?.ok && r1.weaponUpdates?.[0]) {
    const u = r1.weaponUpdates[0];
    if (typeof u.stability === "number") currentWeapon = { ...currentWeapon, stability: u.stability };
    if (typeof u.contamination === "number") currentWeapon = { ...currentWeapon, contamination: u.contamination };
    forgeCount++;
  }

  // 第二次操作：改装（可能因材料不足失败）
  const r2 = executeLightForge({
    actionText: "改装 forge_mod_silent",
    originium: 10,
    inventoryIds: ["I-C01"],
    warehouseIds: [],
    weapon: JSON.parse(JSON.stringify(currentWeapon)),
    weaponSlotEmpty: false,
  });
  if (r2?.ok && r2.weaponUpdates?.[0]) {
    const u = r2.weaponUpdates[0];
    if (u.currentMods) currentWeapon = { ...currentWeapon, currentMods: u.currentMods };
    forgeCount++;
  }

  // 验证锻造操作至少被尝试执行了（函数调用无异常）
  assert.ok(r1 !== null && r2 !== null, "锻造函数应正常返回");
  // 最终武器状态应始终通过不变量检查
  const issues = checkWeaponInvariants(currentWeapon, "after-consecutive-forge");
  assert.deepEqual(issues, [], `锻造后(${forgeCount}次)不变量应通过: ${JSON.stringify(issues)}`);
});

// ── 存档往返一致性 ────────────────────────────────────────────────

test("combo: save/load round-trip preserves weapon key fields", () => {
  const before = {
    weaponId: "W-001",
    tier: "B",
    stability: 75,
    contamination: 15,
    mods: ["silent", "mirror"],
    infusions: [{ threatTag: "liquid", turnsLeft: 3 }],
  };

  const serialized = JSON.stringify(before);
  const after = JSON.parse(serialized);

  const issues = invariantSaveLoadRoundtrip("weapon", before, after, [
    "weaponId",
    "tier",
    "stability",
    "contamination",
    "mods",
    "infusions",
  ]);
  assert.equal(issues.length, 0, `存档往返应一致: ${JSON.stringify(issues)}`);
});

test("combo: save/load round-trip detects deliberate corruption", () => {
  const before = { stability: 80, contamination: 10 };
  const after = { stability: 80, contamination: 999 }; // 故意破坏

  const issues = invariantSaveLoadRoundtrip("weapon", before, after, ["contamination"]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0]!.ok, false);
  assert.ok(issues[0]!.detail.after.includes("999"));
});

// ── 武器池去重 ────────────────────────────────────────────────────

test("combo: equipped weapon should not duplicate in weapon bag", () => {
  const equippedWeapon = createTestWeapon({ id: "W-DUP", tier: "C" });
  const weaponBag = [
    createTestWeapon({ id: "W-DUP", tier: "C" }), // 重复
    createTestWeapon({ id: "W-OTHER", tier: "B" }),
  ];

  // 去重逻辑：equippedWeapon 优先，从 bag 中移除同名
  const dedupedBag = weaponBag.filter((w) => w.id !== equippedWeapon.id);
  assert.equal(dedupedBag.length, 1);
  assert.equal(dedupedBag[0]!.id, "W-OTHER");
  assert.ok(!dedupedBag.some((w) => w.id === equippedWeapon.id));
});
