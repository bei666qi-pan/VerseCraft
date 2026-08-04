/**
 * Combat Injury Integration 测试
 *
 * 覆盖：
 * - "none" → 空 injuries，sanityDamage 0
 * - "light" → 1 minor injury，sanityDamage 1
 * - "moderate" → 1-2 moderate injuries，sanityDamage 2
 * - "heavy" → 至少 1 条 moderate 以上 injury，sanityDamage 3-5
 * - weapon_clash conflictKind → cut 类型
 * - shove conflictKind → bruise 类型
 * - intimidate → cognitive 类型
 * - 安全区降低严重度
 * - sanityDamage 随 cost 等级递增
 * - styleTag 覆盖（mirror_counter → cognitive）
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { combatToInjuryDelta } from "./combatInjuryIntegration";
import type { _CombatConflictKind, CombatOutcomeTier, CombatResolution, CombatStyleTag, SceneCombatContext } from "./types";

// ──────────────────────────────────────
// Helper: 构建最小 CombatResolution
// ──────────────────────────────────────

function makeResolution(overrides: {
  likelyCost?: "none" | "light" | "moderate" | "heavy";
  outcome?: CombatOutcomeTier;
  winner?: "attacker" | "defender" | "none";
  isSafeZone?: boolean;
  styleTags?: CombatStyleTag[];
} = {}): CombatResolution {
  const {
    likelyCost = "none",
    outcome = "stalemate",
    winner = "none",
    isSafeZone = false,
    styleTags = ["close_quarters"],
  } = overrides;

  const scene: SceneCombatContext = {
    locationId: "corridor",
    floorId: "2",
    threatPhase: "active",
    isSafeZone,
    timeOfDay: "day",
    modifiers: { pressure: 0.3, concealment: 0.2, footing: 0.0 },
    notes: [],
  };

  return {
    outcome,
    winner,
    advantageBand: "even",
    attacker: {
      kind: "npc",
      actorId: "A-004",
      score: 15,
      breakdown: { base: 12, scene: 1, equipment: 0, psyche: 1, style: 1, total: 15, notes: [] },
      styleTags: ["ambush"],
    },
    defender: {
      kind: "player",
      actorId: "player",
      score: 10,
      breakdown: { base: 8, scene: 1, equipment: 0, psyche: 1, style: 0, total: 10, notes: [] },
      styleTags,
    },
    scene,
    explain: {
      why: ["NPC aggression high, player footing poor"],
      likelyCost,
      collateral: "none",
    },
  };
}

// ──────────────────────────────────────
// Suite: cost → injury 映射
// ──────────────────────────────────────

describe("combatToInjuryDelta: cost → injury mapping", () => {
  it('returns empty injuries and 0 sanity for "none" cost', () => {
    const delta = combatToInjuryDelta(makeResolution({ likelyCost: "none" }));
    assert.equal(delta.injuries.length, 0);
    assert.equal(delta.sanityDamage, 0);
    assert.equal(delta.narrativeHint, "战斗未造成实质伤害。");
  });

  it('returns 1 minor injury for "light" cost', () => {
    const delta = combatToInjuryDelta(makeResolution({ likelyCost: "light" }));
    assert.equal(delta.injuries.length, 1);
    assert.equal(delta.injuries[0].severity, "minor");
    assert.equal(delta.sanityDamage, 1);
    assert.ok(delta.injuries[0].chance >= 0.3 && delta.injuries[0].chance <= 0.7);
  });

  it('returns 2 injuries for "moderate" cost (primary + secondary bruise)', () => {
    const delta = combatToInjuryDelta(makeResolution({ likelyCost: "moderate" }));
    assert.equal(delta.injuries.length, 2);
    // primary injury should be moderate (non-safe zone)
    assert.equal(delta.injuries[0].severity, "moderate");
    assert.equal(delta.sanityDamage, 2);
  });

  it('returns 2 injuries for "heavy" cost with at least one moderate+', () => {
    const delta = combatToInjuryDelta(makeResolution({ likelyCost: "heavy" }));
    assert.equal(delta.injuries.length, 2);
    const hasNonMinor = delta.injuries.some((i) => i.severity !== "minor");
    assert.ok(hasNonMinor, "Expected at least one non-minor injury for heavy cost");
    assert.ok(delta.sanityDamage >= 3 && delta.sanityDamage <= 5, `Expected sanityDamage 3-5 for heavy, got ${delta.sanityDamage}`);
  });
});

// ──────────────────────────────────────
// Suite: conflictKind → injuryType
// ──────────────────────────────────────

describe("combatToInjuryDelta: conflictKind → injuryType", () => {
  it("weapon_clash yields cut type", () => {
    const delta = combatToInjuryDelta(
      makeResolution({ likelyCost: "light", styleTags: [] }),
      { conflictKind: "weapon_clash" },
    );
    assert.equal(delta.injuries[0].type, "cut");
  });

  it("shove yields bruise type", () => {
    const delta = combatToInjuryDelta(
      makeResolution({ likelyCost: "light" }),
      { conflictKind: "shove" },
    );
    assert.equal(delta.injuries[0].type, "bruise");
  });

  it("intimidate yields cognitive type", () => {
    const delta = combatToInjuryDelta(
      makeResolution({ likelyCost: "light", styleTags: [] }),
      { conflictKind: "intimidate" },
    );
    assert.equal(delta.injuries[0].type, "cognitive");
  });

  it("subdue defaults to bruise", () => {
    const delta = combatToInjuryDelta(
      makeResolution({ likelyCost: "light" }),
      { conflictKind: "subdue" },
    );
    assert.equal(delta.injuries[0].type, "bruise");
  });

  it("escape defaults to bruise", () => {
    const delta = combatToInjuryDelta(
      makeResolution({ likelyCost: "light" }),
      { conflictKind: "escape" },
    );
    assert.equal(delta.injuries[0].type, "bruise");
  });

  it("protect defaults to bruise", () => {
    const delta = combatToInjuryDelta(
      makeResolution({ likelyCost: "light" }),
      { conflictKind: "protect" },
    );
    assert.equal(delta.injuries[0].type, "bruise");
  });
});

// ──────────────────────────────────────
// Suite: styleTag 覆盖
// ──────────────────────────────────────

describe("combatToInjuryDelta: styleTag overrides", () => {
  it("mirror_counter style overrides to cognitive", () => {
    const delta = combatToInjuryDelta(
      makeResolution({ likelyCost: "moderate", styleTags: ["mirror_counter"] }),
      { conflictKind: "weapon_clash" },
    );
    // mirror_counter overrides weapon_clash → cut → cognitive
    assert.equal(delta.injuries[0].type, "cognitive");
  });

  it("boundary_guard style overrides to fracture", () => {
    const delta = combatToInjuryDelta(
      makeResolution({ likelyCost: "moderate", styleTags: ["boundary_guard"] }),
      { conflictKind: "shove" },
    );
    assert.equal(delta.injuries[0].type, "fracture");
  });

  it("ambush style overrides shove to cut", () => {
    const delta = combatToInjuryDelta(
      makeResolution({ likelyCost: "light", styleTags: ["ambush"] }),
      { conflictKind: "shove" },
    );
    assert.equal(delta.injuries[0].type, "cut");
  });

  it("no style tags uses conflictKind default", () => {
    const delta = combatToInjuryDelta(
      makeResolution({ likelyCost: "light", styleTags: [] }),
      { conflictKind: "intimidate" },
    );
    assert.equal(delta.injuries[0].type, "cognitive");
  });

  // ── 扩展 styleTag 覆盖（原未映射，现已接入 STYLE_INJURY）──
  it("tradecraft style overrides to cognitive", () => {
    const delta = combatToInjuryDelta(
      makeResolution({ likelyCost: "light", styleTags: ["tradecraft"] }),
      { conflictKind: "shove" },
    );
    assert.equal(delta.injuries[0].type, "cognitive");
  });

  it("medical_control style overrides to cognitive", () => {
    const delta = combatToInjuryDelta(
      makeResolution({ likelyCost: "light", styleTags: ["medical_control"] }),
      { conflictKind: "weapon_clash" },
    );
    assert.equal(delta.injuries[0].type, "cognitive");
  });

  it("utility_support style overrides to bruise", () => {
    const delta = combatToInjuryDelta(
      makeResolution({ likelyCost: "light", styleTags: ["utility_support"] }),
      { conflictKind: "intimidate" },
    );
    assert.equal(delta.injuries[0].type, "bruise");
  });

  it("social_pressure style overrides to cognitive", () => {
    const delta = combatToInjuryDelta(
      makeResolution({ likelyCost: "light", styleTags: ["social_pressure"] }),
      { conflictKind: "shove" },
    );
    assert.equal(delta.injuries[0].type, "cognitive");
  });

  it("unknown style falls through to conflictKind default", () => {
    // unknown 刻意不映射——回退到 conflictKind 默认（weapon_clash→cut）
    const delta = combatToInjuryDelta(
      makeResolution({ likelyCost: "light", styleTags: ["unknown"] }),
      { conflictKind: "weapon_clash" },
    );
    assert.equal(delta.injuries[0].type, "cut");
  });
});

// ──────────────────────────────────────
// Suite: 安全区修正
// ──────────────────────────────────────

describe("combatToInjuryDelta: safe zone severity reduction", () => {
  it("light in safe zone still yields minor (no lower tier)", () => {
    const delta = combatToInjuryDelta(
      makeResolution({ likelyCost: "light", isSafeZone: true }),
    );
    assert.equal(delta.injuries[0].severity, "minor");
  });

  it("moderate in safe zone downgrades to minor", () => {
    const delta = combatToInjuryDelta(
      makeResolution({ likelyCost: "moderate", isSafeZone: true }),
    );
    assert.equal(delta.injuries[0].severity, "minor");
  });

  it("heavy in safe zone downgrades severe to moderate", () => {
    const delta = combatToInjuryDelta(
      makeResolution({ likelyCost: "heavy", isSafeZone: true }),
    );
    // primary injury should be moderate, not severe
    assert.equal(delta.injuries[0].severity, "moderate");
  });

  it("non-safe zone keeps full severity", () => {
    const deltaModerate = combatToInjuryDelta(
      makeResolution({ likelyCost: "moderate", isSafeZone: false }),
    );
    assert.equal(deltaModerate.injuries[0].severity, "moderate");

    const deltaHeavy = combatToInjuryDelta(
      makeResolution({ likelyCost: "heavy", isSafeZone: false }),
    );
    assert.equal(deltaHeavy.injuries[0].severity, "severe");
  });
});

// ──────────────────────────────────────
// Suite: sanityDamage 递增
// ──────────────────────────────────────

describe("combatToInjuryDelta: sanityDamage progression", () => {
  it("sanity damage increases with cost", () => {
    const noneDelta = combatToInjuryDelta(makeResolution({ likelyCost: "none" }));
    const lightDelta = combatToInjuryDelta(makeResolution({ likelyCost: "light" }));
    const moderateDelta = combatToInjuryDelta(makeResolution({ likelyCost: "moderate" }));
    const heavyDelta = combatToInjuryDelta(makeResolution({ likelyCost: "heavy" }));

    assert.equal(noneDelta.sanityDamage, 0);
    assert.equal(lightDelta.sanityDamage, 1);
    assert.equal(moderateDelta.sanityDamage, 2);
    assert.equal(heavyDelta.sanityDamage, 4);
  });
});

// ──────────────────────────────────────
// Suite: heavy 模式下的类型提升
// ──────────────────────────────────────

describe("combatToInjuryDelta: heavy cost type promotion", () => {
  it("heavy + shove (bruise base) promotes to fracture", () => {
    const delta = combatToInjuryDelta(
      makeResolution({ likelyCost: "heavy" }),
      { conflictKind: "shove" },
    );
    assert.equal(delta.injuries[0].type, "fracture");
  });

  it("heavy + weapon_clash stays cut", () => {
    const delta = combatToInjuryDelta(
      makeResolution({ likelyCost: "heavy", styleTags: [] }),
      { conflictKind: "weapon_clash" },
    );
    assert.equal(delta.injuries[0].type, "cut");
  });

  it("heavy + intimidate stays cognitive", () => {
    const delta = combatToInjuryDelta(
      makeResolution({ likelyCost: "heavy", styleTags: [] }),
      { conflictKind: "intimidate" },
    );
    assert.equal(delta.injuries[0].type, "cognitive");
  });
});
