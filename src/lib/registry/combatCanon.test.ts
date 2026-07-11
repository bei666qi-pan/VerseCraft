/**
 * Combat Canon 注册表测试
 *
 * 覆盖：
 * - 每个 A-00x block 都有有效 basePower (20-45) 和 floor
 * - getAnomalyCombatStat() 对已知 ID 返回非 null，对未知返回 null
 * - getFloorCombatModifier() 对所有 9 个 FloorId 返回非 null
 * - combat stat 的 vulnerableToTags 与 weapons.ts 现有 counterThreatIds 对应
 * - FloorCombatModifier 各字段在合理范围
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ANOMALY_COMBAT_STATS,
  FLOOR_COMBAT_MODIFIERS,
  getAnomalyCombatStat,
  getFloorCombatModifier,
} from "./combatCanon";
import { WEAPON_TEMPLATES } from "./weapons";
import { ANOMALIES } from "./anomalies";
import type { FloorId } from "./types";

// ──────────────────────────────────────
// Anomaly stat blocks
// ──────────────────────────────────────

describe("ANOMALY_COMBAT_STATS", () => {
  it("has exactly 8 entries (A-001 through A-008)", () => {
    assert.equal(ANOMALY_COMBAT_STATS.length, 8);
  });

  it("every entry has a valid basePower (20..45)", () => {
    for (const stat of ANOMALY_COMBAT_STATS) {
      assert.ok(
        stat.basePower >= 20 && stat.basePower <= 45,
        `${stat.threatId} basePower ${stat.basePower} out of range [20,45]`,
      );
    }
  });

  it("every entry has a non-empty name", () => {
    for (const stat of ANOMALY_COMBAT_STATS) {
      assert.ok(stat.name.length > 0, `${stat.threatId} has empty name`);
    }
  });

  it("every entry has a valid floor assignment", () => {
    const validFloors: FloorId[] = ["B2", "B1", "1", "2", "3", "4", "5", "6", "7"];
    for (const stat of ANOMALY_COMBAT_STATS) {
      assert.ok(
        validFloors.includes(stat.floor),
        `${stat.threatId} has invalid floor "${stat.floor}"`,
      );
    }
  });

  it("every entry has volatility/aggression/discipline/resilience/fearThreshold in [0,1]", () => {
    for (const stat of ANOMALY_COMBAT_STATS) {
      for (const key of ["volatility", "aggression", "discipline", "resilience", "fearThreshold"] as const) {
        const val = stat[key];
        assert.ok(
          val >= 0 && val <= 1,
          `${stat.threatId}.${key} = ${val} out of range [0,1]`,
        );
      }
    }
  });

  it("every entry has at least one styleTag", () => {
    for (const stat of ANOMALY_COMBAT_STATS) {
      assert.ok(stat.styleTags.length >= 1, `${stat.threatId} has no styleTags`);
    }
  });

  it("every entry has at least one vulnerableToTag", () => {
    for (const stat of ANOMALY_COMBAT_STATS) {
      assert.ok(
        stat.vulnerableToTags.length >= 1,
        `${stat.threatId} has no vulnerableToTags`,
      );
    }
  });

  it("every entry has a non-empty uniqueThreatNote", () => {
    for (const stat of ANOMALY_COMBAT_STATS) {
      assert.ok(
        stat.uniqueThreatNote.length > 0,
        `${stat.threatId} has empty uniqueThreatNote`,
      );
    }
  });

  it("known entries have correct floor per rootCanon.ts binding", () => {
    const floorMap: Record<string, FloorId> = {
      "A-001": "1",
      "A-002": "4",
      "A-003": "3",
      "A-004": "2",
      "A-005": "5",
      "A-006": "6",
      "A-007": "7",
      "A-008": "B2",
    };
    for (const stat of ANOMALY_COMBAT_STATS) {
      const expected = floorMap[stat.threatId];
      assert.ok(expected !== undefined, `${stat.threatId} missing from floorMap`);
      assert.equal(stat.floor, expected, `${stat.threatId} should be on ${expected}`);
    }
  });
});

// ──────────────────────────────────────
// Floor combat modifiers
// ──────────────────────────────────────

describe("FLOOR_COMBAT_MODIFIERS", () => {
  it("has exactly 9 entries (B2, B1, 1-7)", () => {
    assert.equal(FLOOR_COMBAT_MODIFIERS.length, 9);
  });

  it("covers all 9 FloorId values", () => {
    const covered = new Set(FLOOR_COMBAT_MODIFIERS.map((m) => m.floor));
    const expected: FloorId[] = ["B2", "B1", "1", "2", "3", "4", "5", "6", "7"];
    for (const f of expected) {
      assert.ok(covered.has(f), `Floor "${f}" missing from FLOOR_COMBAT_MODIFIERS`);
    }
  });

  it("concealment is in [-1, 1]", () => {
    for (const mod of FLOOR_COMBAT_MODIFIERS) {
      assert.ok(
        mod.concealment >= -1 && mod.concealment <= 1,
        `${mod.floor} concealment ${mod.concealment} out of range`,
      );
    }
  });

  it("pressure is in [-1, 1]", () => {
    for (const mod of FLOOR_COMBAT_MODIFIERS) {
      assert.ok(
        mod.pressure >= -1 && mod.pressure <= 1,
        `${mod.floor} pressure ${mod.pressure} out of range`,
      );
    }
  });

  it("every entry has a non-empty label and note", () => {
    for (const mod of FLOOR_COMBAT_MODIFIERS) {
      assert.ok(mod.label.length > 0, `${mod.floor} has empty label`);
      assert.ok(mod.note.length > 0, `${mod.floor} has empty note`);
    }
  });
});

// ──────────────────────────────────────
// Lookup helpers
// ──────────────────────────────────────

describe("getAnomalyCombatStat", () => {
  it("returns a block for known threatIds A-001 through A-008", () => {
    for (let i = 1; i <= 8; i++) {
      const id = `A-00${i}`;
      const result = getAnomalyCombatStat(id);
      assert.ok(result !== null, `getAnomalyCombatStat("${id}") returned null`);
      assert.equal(result!.threatId, id);
    }
  });

  it("returns null for unknown threatId", () => {
    assert.equal(getAnomalyCombatStat("A-009"), null);
    assert.equal(getAnomalyCombatStat("N-001"), null);
    assert.equal(getAnomalyCombatStat(""), null);
  });
});

describe("getFloorCombatModifier", () => {
  it("returns a modifier for every FloorId", () => {
    const floors: FloorId[] = ["B2", "B1", "1", "2", "3", "4", "5", "6", "7"];
    for (const floor of floors) {
      const result = getFloorCombatModifier(floor);
      assert.ok(result !== null, `getFloorCombatModifier("${floor}") returned null`);
    }
  });

  it("returns null for unknown floor", () => {
    assert.equal(getFloorCombatModifier("8" as FloorId), null);
    assert.equal(getFloorCombatModifier("" as FloorId), null);
  });
});

// ──────────────────────────────────────
// Cross-registry consistency
// ──────────────────────────────────────

describe("cross-registry consistency", () => {
  /**
   * weapons.ts 定义的武器 → 威胁克制关系检查
   *
   * 五种武器在 weapons.ts 中有对应 counterThreatIds：
   *   silent_baton   → A-002  (counterTags: sound, silence)
   *   clock_spike    → A-001  (counterTags: time, anchor)
   *   mirror_dagger  → A-005  (counterTags: mirror, direction)
   *   sealing_spike  → A-006  (counterTags: seal, door)
   *   mind_spike     → A-008  (counterTags: cognition, anchor)
   *
   * 这里校验对应 anomaly 的 vulnerableToTags 包含这些标签。
   * A-003（cognition,sound）/A-004（time,direction）/A-007（anchor,seal）
   * 为刻意设计的"无单一武器完整反制"型威胁——需双武器或策略组合。
   */
  it("silent_baton counterTags match A-002 vulnerableToTags", () => {
    const stat = getAnomalyCombatStat("A-002");
    assert.ok(stat !== null);
    for (const tag of ["sound", "silence"]) {
      assert.ok(
        stat!.vulnerableToTags.includes(tag),
        `A-002 vulnerableToTags missing "${tag}"`,
      );
    }
  });

  it("clock_spike counterTags match A-001 vulnerableToTags", () => {
    const stat = getAnomalyCombatStat("A-001");
    assert.ok(stat !== null);
    for (const tag of ["time", "anchor"]) {
      assert.ok(
        stat!.vulnerableToTags.includes(tag),
        `A-001 vulnerableToTags missing "${tag}"`,
      );
    }
  });

  it("mirror_dagger counterTags match A-005 vulnerableToTags", () => {
    const stat = getAnomalyCombatStat("A-005");
    assert.ok(stat !== null);
    for (const tag of ["mirror", "direction"]) {
      assert.ok(
        stat!.vulnerableToTags.includes(tag),
        `A-005 vulnerableToTags missing "${tag}"`,
      );
    }
  });

  it("sealing_spike counterTags match A-006 vulnerableToTags", () => {
    const stat = getAnomalyCombatStat("A-006");
    assert.ok(stat !== null);
    for (const tag of ["seal", "door"]) {
      assert.ok(
        stat!.vulnerableToTags.includes(tag),
        `A-006 vulnerableToTags missing "${tag}"`,
      );
    }
  });

  it("mind_spike counterTags match A-008 vulnerableToTags", () => {
    const stat = getAnomalyCombatStat("A-008");
    assert.ok(stat !== null);
    for (const tag of ["cognition", "anchor"]) {
      assert.ok(
        stat!.vulnerableToTags.includes(tag),
        `A-008 vulnerableToTags missing "${tag}"`,
      );
    }
  });

  it("at least 5 of 8 anomalies have a single-weapon full counter", () => {
    // 完整反制 = 存在某武器，其 counterTags 全部 ∈ anomaly.vulnerableToTags
    // 期望：A-001/002/005/006/008 至少 5 条有完整反制
    // A-003/004/007 刻意为"无单一武器完整反制"型（双武器/策略组合）
    const expectedFull = ["A-001", "A-002", "A-005", "A-006", "A-008"];
    let matched = 0;
    for (const tid of expectedFull) {
      const stat = getAnomalyCombatStat(tid);
      assert.ok(stat !== null, `${tid} missing`);
      const hasFull = WEAPON_TEMPLATES.some((w) =>
        w.counterTags.every((t) => stat!.vulnerableToTags.includes(t)),
      );
      if (hasFull) matched++;
    }
    assert.ok(
      matched >= 5,
      `expected >=5 full-counterable anomalies, got ${matched}`,
    );
  });

  it("every weapon counterThreatId resolves to a real anomaly with matching tags", () => {
    // 互操作不变量：weapons.ts 的 counterThreatIds 必须指向 combatCanon 中
    // 真实存在的 A-00x，且该武器的 counterTags 至少有一个 ∈ 该异常的 vulnerableToTags
    for (const w of WEAPON_TEMPLATES) {
      for (const tid of w.counterThreatIds) {
        const stat = getAnomalyCombatStat(tid);
        assert.ok(stat !== null, `weapon ${w.templateId} counters unknown ${tid}`);
        const hasOverlap = w.counterTags.some((t) =>
          stat!.vulnerableToTags.includes(t),
        );
        assert.ok(
          hasOverlap,
          `weapon ${w.name} counterTags ${w.counterTags.join(",")} 不匹配 ${tid} vulnerableToTags ${stat!.vulnerableToTags.join(",")}`,
        );
      }
    }
  });

  it("every anomaly combatName matches combatCanon name (dual-face invariant)", () => {
    // 轴 2 强制约束：anomalies.ts 的 combatName 必须与 combatCanon.ts name 一致。
    // 两个注册表由不同作者维护（anomalies.ts=lore 侧，combatCanon.ts=战斗侧），
    // 此测试确保它们不漂移。
    for (const a of ANOMALIES) {
      const combatStat = getAnomalyCombatStat(a.id);
      assert.ok(combatStat !== null, `anomaly ${a.id} missing in combatCanon`);
      assert.equal(
        a.combatName,
        combatStat!.name,
        `anomalies.ts ${a.id} name="${a.name}" combatName="${a.combatName}" 与 combatCanon.ts name="${combatStat!.name}" 不匹配`,
      );
    }
  });

  it("every combatCanon entry has a matching anomaly with distinct lore name", () => {
    for (const s of ANOMALY_COMBAT_STATS) {
      const anomaly = ANOMALIES.find((a) => a.id === s.threatId);
      assert.ok(anomaly !== null, `combatCanon ${s.threatId} missing in anomalies.ts`);
      assert.equal(
        anomaly!.combatName,
        s.name,
        `combatCanon ${s.threatId} name="${s.name}" 与 anomalies.ts combatName="${anomaly!.combatName}" 不匹配`,
      );
      // 双轨设计：anomalies.ts name（lore 名）必须与 combatCanon.ts name（战斗名）保持语义差异
      assert.ok(
        anomaly!.name !== s.name,
        `anomalies.ts ${s.threatId} name="${anomaly!.name}" 不应直接等于 combatCanon name="${s.name}"（双轨设计需保持语义差异）`,
      );
    }
  });
});
