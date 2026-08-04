/**
 * 测试夹具工厂（Test Fixtures）
 *
 * 提供可直接构造玩法状态的工厂函数，无需从注册/教程/完整 UI 流程开始。
 * 所有工厂函数返回完全类型化、可直接传入 gameplay 函数的数据。
 *
 * 用法：
 *   import { createTestWeapon, createTestStats } from "@/lib/testing/fixtures";
 *   const weapon = createTestWeapon({ tier: "B", stability: 80 });
 *   const stats = createTestStats({ agility: 20 });
 */

import type { Weapon, InfusionState, WeaponTier, WeaponModKind, StatType } from "@/lib/registry/types";
import type { ProfessionId } from "@/lib/profession/types";

// ── 属性 ────────────────────────────────────────────────────────────

export function createTestStats(overrides: Partial<Record<StatType, number>> = {}): Record<StatType, number> {
  return {
    sanity: 12,
    agility: 12,
    luck: 10,
    charm: 10,
    background: 10,
    ...overrides,
  };
}

// ── 武器 ────────────────────────────────────────────────────────────

export function createTestWeapon(overrides: Partial<Weapon> = {}): Weapon {
  return {
    id: "W-TEST-001",
    name: "测试武器",
    description: "测试用武器，不应用于正式游戏。",
    counterThreatIds: [],
    counterTags: [],
    stability: 80,
    calibratedThreatId: null,
    modSlots: ["core", "surface"],
    currentMods: [],
    currentInfusions: [],
    contamination: 0,
    repairable: true,
    tier: "C" as WeaponTier,
    equipSlot: "weapon_main",
    equipTimeCostTurns: 1,
    ...overrides,
  };
}

/**
 * 创建一把带有特定模组的武器。
 */
export function createTestWeaponWithMods(
  mods: WeaponModKind[],
  baseOverrides: Partial<Weapon> = {}
): Weapon {
  return createTestWeapon({
    ...baseOverrides,
    currentMods: [...mods],
  });
}

/**
 * 创建一把带有特定灌注的武器。
 */
export function createTestWeaponWithInfusions(
  infusions: InfusionState[],
  baseOverrides: Partial<Weapon> = {}
): Weapon {
  return createTestWeapon({
    ...baseOverrides,
    currentInfusions: infusions.map((i) => ({ ...i })),
  });
}

// ── 职业 ────────────────────────────────────────────────────────────

export function createTestProfessionState(overrides: {
  currentProfession?: ProfessionId | null;
  certified?: boolean;
  activePerks?: string[];
  activeSkill?: string | null;
} = {}) {
  return {
    currentProfession: overrides.currentProfession ?? null,
    certified: overrides.certified ?? false,
    activePerks: overrides.activePerks ?? [],
    activeSkill: overrides.activeSkill ?? null,
    progressByProfession: {} as Record<ProfessionId, unknown>,
  };
}

// ── 配方信息 ───────────────────────────────────────────────────────

export interface TestForgeRecipeInfo {
  id: string;
  operation: string;
  costOriginium: number;
  requiredMaterialTags: string[];
  weaponMod?: string;
  infusionTag?: string;
}

/**
 * 获取锻造配方的轻量信息（用于测试）。
 */
export function getTestForgeRecipes(): TestForgeRecipeInfo[] {
  return [
    { id: "forge_repair_basic", operation: "repair", costOriginium: 1, requiredMaterialTags: ["insulation"] },
    { id: "forge_mod_silent", operation: "mod", costOriginium: 2, requiredMaterialTags: ["sound", "fiber"], weaponMod: "silent" },
    { id: "forge_mod_mirror", operation: "mod", costOriginium: 2, requiredMaterialTags: ["mirror"], weaponMod: "mirror" },
    { id: "forge_mod_grappling", operation: "mod", costOriginium: 2, requiredMaterialTags: ["fiber", "sealant"], weaponMod: "grappling" },
    { id: "forge_infuse_liquid", operation: "infuse", costOriginium: 1, requiredMaterialTags: ["conductive", "pollution"], infusionTag: "liquid" },
    { id: "forge_infuse_mirror", operation: "infuse", costOriginium: 1, requiredMaterialTags: ["mirror"], infusionTag: "mirror" },
    { id: "forge_infuse_seal", operation: "infuse", costOriginium: 1, requiredMaterialTags: ["sealant"], infusionTag: "seal" },
  ];
}
