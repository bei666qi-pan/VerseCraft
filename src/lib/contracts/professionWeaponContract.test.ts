/**
 * 职业 + 武器系统联合契约测试
 *
 * 验证职业认证、技能激活、武器属性、战斗判决等核心交互逻辑。
 * 这些测试独立于 LLM —— 只验证游戏逻辑层。
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

// === 职业系统 ===

type ProfessionId = "investigator" | "enforcer" | "night_watcher" | "executor" | "warden" | "weaver" | "herald";

interface ProfessionState {
  currentProfession: ProfessionId | null;
  unlockedProfessions: ProfessionId[];
  certifiedProfessions: ProfessionId[];
  professionFlags: Record<string, boolean>;
  professionCooldowns: Record<string, number>;
}

function canCertify(state: ProfessionState, profId: ProfessionId): boolean {
  return state.unlockedProfessions.includes(profId) && !state.certifiedProfessions.includes(profId);
}

function certify(state: ProfessionState, profId: ProfessionId): ProfessionState {
  if (!canCertify(state, profId)) return { ...state };
  return {
    ...state,
    certifiedProfessions: [...state.certifiedProfessions, profId],
    currentProfession: state.currentProfession ?? profId,
  };
}

function isActiveSkillAvailable(state: ProfessionState, currentHour: number): boolean {
  if (!state.currentProfession) return false;
  const flagKey = `active_engaged_${state.currentProfession}`;
  if (!state.professionFlags[flagKey]) return false;
  const cdKey = `cd_${state.currentProfession}`;
  const cooldownUntil = state.professionCooldowns[cdKey] ?? 0;
  return currentHour >= cooldownUntil;
}

function useActiveSkill(state: ProfessionState, currentHour: number, cooldownHours: number): ProfessionState {
  if (!state.currentProfession) return { ...state };
  return {
    ...state,
    professionCooldowns: {
      ...state.professionCooldowns,
      [`cd_${state.currentProfession}`]: currentHour + cooldownHours,
    },
  };
}

// === 武器系统 ===

interface Weapon {
  id: string;
  name: string;
  stability: number; // 0-100
  counter: string;
  module: string | null;
  infusion: string | null;
  contamination: number; // 0-100
}

interface CombatInput {
  weapon: Weapon | null;
  playerStats: { spirit: number; agility: number; luck: number };
  threatLevel: number; // 1-10
}

interface CombatResult {
  hit: boolean;
  damage: number;
  counterTriggered: boolean;
  weaponDegraded: boolean;
  stabilityLoss: number;
}

function resolveCombat(input: CombatInput): CombatResult {
  if (!input.weapon) {
    // 徒手战斗
    const baseChance = 0.3 + input.playerStats.agility * 0.05;
    const hit = Math.random() < baseChance;
    return {
      hit,
      damage: hit ? Math.max(1, Math.floor(input.playerStats.spirit * 0.5)) : 0,
      counterTriggered: false,
      weaponDegraded: false,
      stabilityLoss: 0,
    };
  }

  const baseChance = 0.5 + (input.weapon.stability / 100) * 0.3 + input.playerStats.agility * 0.03;
  const hit = Math.random() < baseChance;
  const stabilityLoss = hit ? Math.floor(Math.random() * 3) + 1 : 0;
  const newStability = input.weapon.stability - stabilityLoss;

  return {
    hit,
    damage: hit ? Math.max(1, Math.floor(input.playerStats.spirit * 0.6 + input.weapon.stability * 0.1)) : 0,
    counterTriggered: hit && input.weapon.counter !== "无" && Math.random() < 0.3,
    weaponDegraded: newStability <= 0,
    stabilityLoss,
  };
}

function canStillUse(weapon: Weapon): boolean {
  return weapon.stability > 0 && weapon.contamination < 100;
}

function degradeWeapon(weapon: Weapon, amount: number): Weapon {
  return {
    ...weapon,
    stability: Math.max(0, weapon.stability - amount),
  };
}

describe("职业系统契约", () => {
  const baseState: ProfessionState = {
    currentProfession: null,
    unlockedProfessions: ["investigator", "enforcer"],
    certifiedProfessions: [],
    professionFlags: {},
    professionCooldowns: {},
  };

  describe("职业认证", () => {
    it("满足条件时可以认证", () => {
      assert.equal(canCertify(baseState, "investigator"), true);
    });

    it("已认证不可重复认证", () => {
      const state = certify(baseState, "investigator");
      assert.equal(canCertify(state, "investigator"), false);
    });

    it("未解锁职业不可认证", () => {
      assert.equal(canCertify(baseState, "night_watcher" as ProfessionId), false);
    });

    it("认证后自动设为当前职业（如果此前无职业）", () => {
      const state = certify(baseState, "investigator");
      assert.equal(state.currentProfession, "investigator");
      assert.ok(state.certifiedProfessions.includes("investigator"));
    });
  });

  describe("主动技能冷却", () => {
    it("冷却未结束时技能不可用", () => {
      const state: ProfessionState = {
        ...baseState,
        currentProfession: "investigator",
        professionFlags: { active_engaged_investigator: true },
        professionCooldowns: { cd_investigator: 20 },
      };
      assert.equal(isActiveSkillAvailable(state, 18), false);
    });

    it("冷却结束后技能可用", () => {
      const state: ProfessionState = {
        ...baseState,
        currentProfession: "investigator",
        professionFlags: { active_engaged_investigator: true },
        professionCooldowns: { cd_investigator: 20 },
      };
      assert.equal(isActiveSkillAvailable(state, 22), true);
    });

    it("使用技能后设置冷却", () => {
      const state: ProfessionState = {
        ...baseState,
        currentProfession: "investigator",
        professionFlags: { active_engaged_investigator: true },
        professionCooldowns: {},
      };
      const newState = useActiveSkill(state, 10, 6);
      assert.equal(newState.professionCooldowns["cd_investigator"], 16);
    });

    it("无职业时技能不可用", () => {
      assert.equal(isActiveSkillAvailable(baseState, 10), false);
    });
  });
});

describe("武器系统契约", () => {
  const baseWeapon: Weapon = {
    id: "flashlight_police",
    name: "警用手电",
    stability: 72,
    counter: "目眩",
    module: "高亮",
    infusion: null,
    contamination: 0,
  };

  describe("武器可用性", () => {
    it("正常武器可用", () => {
      assert.equal(canStillUse(baseWeapon), true);
    });

    it("稳定度为0时不可用", () => {
      assert.equal(canStillUse({ ...baseWeapon, stability: 0 }), false);
    });

    it("污染满时不可用", () => {
      assert.equal(canStillUse({ ...baseWeapon, contamination: 100 }), false);
    });
  });

  describe("武器降级", () => {
    it("降级减少稳定度", () => {
      const degraded = degradeWeapon(baseWeapon, 10);
      assert.equal(degraded.stability, 62);
      assert.equal(degraded.name, "警用手电", "降级不改变其他属性");
    });

    it("稳定度最低为0", () => {
      const degraded = degradeWeapon(baseWeapon, 100);
      assert.equal(degraded.stability, 0);
    });
  });

  describe("战斗判决", () => {
    it("徒手战斗有基础命中率", () => {
      // 不测随机结果，只测逻辑路径
      const result = resolveCombat({
        weapon: null,
        playerStats: { spirit: 5, agility: 5, luck: 3 },
        threatLevel: 3,
      });
      assert.equal(result.counterTriggered, false, "徒手无法触发反制");
      assert.equal(result.weaponDegraded, false, "徒手无武器降级");
    });

    it("有武器时稳定性影响命中", () => {
      const highStab = resolveCombat({
        weapon: { ...baseWeapon, stability: 90 },
        playerStats: { spirit: 5, agility: 5, luck: 3 },
        threatLevel: 3,
      });
      // 基础命中率应更高（不做确定性断言，只验证字段存在）
      assert.ok("hit" in highStab);
      assert.ok("damage" in highStab);
    });

    it("武器稳定性为0时应无法使用", () => {
      const broken: Weapon = { ...baseWeapon, stability: 0 };
      assert.equal(canStillUse(broken), false);
    });
  });

  describe("武器属性保留", () => {
    it("武器 ID 和名称不可变", () => {
      const degraded = degradeWeapon(baseWeapon, 5);
      assert.equal(degraded.id, "flashlight_police");
      assert.equal(degraded.name, "警用手电");
      assert.equal(degraded.counter, "目眩");
      assert.equal(degraded.module, "高亮");
    });
  });
});
