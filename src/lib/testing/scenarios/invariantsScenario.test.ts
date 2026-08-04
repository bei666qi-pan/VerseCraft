/**
 * 场景测试：玩法不变量
 *
 * 覆盖：
 * - 武器稳定性/污染/品级合法性
 * - 武器模组去重和槽位限制
 * - 武器灌注合法性
 * - 资源非负
 * - 存档往返一致性
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  invariantWeaponStability,
  invariantWeaponContamination,
  invariantWeaponTier,
  invariantWeaponInfusions,
  invariantWeaponModsUnique,
  invariantWeaponModSlotLimit,
  invariantNonNegative,
  invariantSaveLoadRoundtrip,
  checkWeaponInvariants,
} from "@/lib/testing/invariants";
import { createTestWeapon, createTestWeaponWithMods, createTestWeaponWithInfusions } from "@/lib/testing/fixtures";

// ── 武器不变量 ────────────────────────────────────────────────────

test("invariants: valid weapon passes all checks", () => {
  const weapon = createTestWeapon({ id: "W-001", stability: 80, contamination: 10, tier: "B", currentMods: ["silent"], currentInfusions: [] });
  const issues = checkWeaponInvariants(weapon, "valid");
  assert.deepEqual(issues, [], `有效武器不应触发不变量: ${JSON.stringify(issues)}`);
});

test("invariants: weapon stability out of bounds", () => {
  const weaponHigh = createTestWeapon({ id: "W-001", stability: 150 });
  const result = invariantWeaponStability(weaponHigh);
  assert.equal(result.ok, false);
  assert.ok(result.message.includes("越界"));

  const weaponNeg = createTestWeapon({ id: "W-001", stability: -10 });
  assert.equal(invariantWeaponStability(weaponNeg).ok, false);
});

test("invariants: weapon contamination out of bounds", () => {
  const weapon = createTestWeapon({ id: "W-001", contamination: 200 });
  const result = invariantWeaponContamination(weapon);
  assert.equal(result.ok, false);
  assert.ok(result.message.includes("越界"));
});

test("invariants: null weapon always passes", () => {
  assert.equal(invariantWeaponStability(null).ok, true);
  assert.equal(invariantWeaponContamination(undefined).ok, true);
});

test("invariants: invalid weapon tier detected", () => {
  const weapon = createTestWeapon({ id: "W-001", tier: "D" as any });
  const result = invariantWeaponTier(weapon);
  assert.equal(result.ok, false);
  assert.ok(result.message.includes("品级非法"));
});

test("invariants: negative infusion turnsLeft detected", () => {
  const weapon = createTestWeaponWithInfusions(
    [{ threatTag: "liquid", turnsLeft: -1 }],
    { id: "W-001" }
  );
  const result = invariantWeaponInfusions(weapon);
  assert.equal(result.ok, false);
  assert.ok(result.message.includes("turnsLeft"));
});

test("invariants: duplicate mods detected", () => {
  const weapon = createTestWeaponWithMods(["silent", "silent"], { id: "W-001" });
  const result = invariantWeaponModsUnique(weapon);
  assert.equal(result.ok, false);
  assert.ok(result.message.includes("重复"));
});

test("invariants: mod slot limit exceeded", () => {
  const weapon = createTestWeaponWithMods(["silent", "mirror", "grappling"], { id: "W-001", modSlots: ["core", "surface"] });
  const result = invariantWeaponModSlotLimit(weapon);
  assert.equal(result.ok, false);
  assert.ok(result.message.includes("超过槽位"));
});

// ── 资源不变量 ────────────────────────────────────────────────────

test("invariants: non-negative resources", () => {
  assert.equal(invariantNonNegative("原石", 10).ok, true);
  assert.equal(invariantNonNegative("原石", 0).ok, true);
  assert.equal(invariantNonNegative("原石", -5).ok, false);
  assert.equal(invariantNonNegative("原石", NaN).ok, false);
  assert.equal(invariantNonNegative("原石", Infinity).ok, false);
});

// ── 存档往返 ──────────────────────────────────────────────────────

test("invariants: save/load roundtrip consistency", () => {
  const before = {
    weaponId: "W-001",
    stability: 80,
    contamination: 10,
    mods: ["silent"],
    stats: { sanity: 15, agility: 12 },
  };
  // 模拟：保存 → 序列化 → 反序列化 → 加载
  const after = JSON.parse(JSON.stringify(before));

  const issues = invariantSaveLoadRoundtrip("weapon-state", before, after, [
    "weaponId",
    "stability",
    "contamination",
  ]);
  assert.deepEqual(issues, [], `存档往返应一致: ${JSON.stringify(issues)}`);
});

test("invariants: save/load roundtrip detects mismatch", () => {
  const before = { weaponId: "W-001", stability: 80 };
  const after = { weaponId: "W-001", stability: 90 }; // 不一致

  const issues = invariantSaveLoadRoundtrip("weapon-state", before, after, ["stability"]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0]!.ok, false);
});
