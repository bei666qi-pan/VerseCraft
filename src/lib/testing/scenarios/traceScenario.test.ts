/**
 * 场景测试：结构化轨迹
 *
 * 覆盖：
 * - 创建追踪会话
 * - 添加和比较事件
 * - 找到第一个差异
 * - 提取关键路径摘要
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  createTraceSession,
  pushTraceEvent,
  finalizeTraceSession,
  findFirstDifference,
  traceDigest,
} from "@/lib/testing/trace";

// ── 基本操作 ──────────────────────────────────────────────────────

test("trace: create and finalize session", () => {
  const session = createTraceSession("武器锻造测试", 42);
  assert.equal(session.scenario, "武器锻造测试");
  assert.equal(session.seed, 42);
  assert.equal(session.events.length, 0);
  assert.equal(session.endedAt, null);

  finalizeTraceSession(session);
  assert.ok(session.endedAt !== null, "finalize 后 endedAt 应非空");
});

test("trace: push event increments seq", () => {
  const session = createTraceSession("test", 1);
  pushTraceEvent(session, { phase: "weapon_equip", action: "装备武器", weaponId: "W-001" });
  pushTraceEvent(session, { phase: "combat_start", action: "进入战斗", weaponId: "W-001" });

  assert.equal(session.events.length, 2);
  assert.equal(session.events[0]!.seq, 1);
  assert.equal(session.events[1]!.seq, 2);
});

// ── 差异比较 ──────────────────────────────────────────────────────

test("trace: findFirstDifference returns null for identical sessions", () => {
  const a = createTraceSession("test", 1);
  const b = createTraceSession("test", 1);

  pushTraceEvent(a, { phase: "weapon_equip", action: "装备", weaponId: "W-001" });
  pushTraceEvent(b, { phase: "weapon_equip", action: "装备", weaponId: "W-001" });

  const diff = findFirstDifference(a, b);
  assert.equal(diff, null, "相同会话应无差异");
});

test("trace: findFirstDifference detects first divergent event", () => {
  const a = createTraceSession("test", 1);
  const b = createTraceSession("test", 1);

  pushTraceEvent(a, { phase: "weapon_equip", action: "装备", weaponId: "W-001" });
  pushTraceEvent(b, { phase: "weapon_equip", action: "装备", weaponId: "W-001" });

  pushTraceEvent(a, { phase: "combat_start", action: "攻击", baseValue: 10 });
  pushTraceEvent(b, { phase: "combat_start", action: "攻击", baseValue: 15 }); // 差异

  const diff = findFirstDifference(a, b);
  assert.ok(diff !== null);
  assert.equal(diff!.seq, 2);
  assert.equal(diff!.phase, "combat_start");
});

test("trace: findFirstDifference handles different lengths", () => {
  const a = createTraceSession("test", 1);
  const b = createTraceSession("test", 1);

  pushTraceEvent(a, { phase: "weapon_equip", action: "装备", weaponId: "W-001" });
  pushTraceEvent(a, { phase: "combat_end", action: "结束" });
  pushTraceEvent(b, { phase: "weapon_equip", action: "装备", weaponId: "W-001" });

  const diff = findFirstDifference(a, b);
  assert.ok(diff !== null);
  assert.equal(diff!.seq, 2);
});

// ── 摘要提取 ─────────────────────────────────────────────────────

test("trace: digest extracts key path summary", () => {
  const session = createTraceSession("test", 1);
  pushTraceEvent(session, {
    phase: "weapon_forge",
    action: "改装武器",
    weaponId: "W-001",
    forgeBefore: { mods: [] },
    forgeAfter: { mods: ["silent"] },
    rngSeed: 42,
  });
  pushTraceEvent(session, {
    phase: "combat_score_player",
    action: "计算玩家得分",
    weaponId: "W-001",
    finalValue: 25.5,
    rngSeed: 42,
  });

  const digest = traceDigest(session);
  assert.equal(digest.length, 2);
  assert.ok(digest[0]!.includes("weapon_forge"));
  assert.ok(digest[0]!.includes("W-001"));
  assert.ok(digest[1]!.includes("25.5"));
});

// ── 完整片段端到端 ────────────────────────────────────────────────

test("trace: complete weapon→forge→combat flow", () => {
  const session = createTraceSession("武器锻造→战斗完整链路", 2024);

  pushTraceEvent(session, {
    phase: "scenario_setup",
    action: "初始化测试角色",
    characterId: "player-1",
    statsBefore: { sanity: 12, agility: 12, luck: 10, charm: 10, background: 10 },
  });

  pushTraceEvent(session, {
    phase: "weapon_equip",
    action: "装备武器",
    weaponId: "W-001",
    actor: "player-1",
  });

  pushTraceEvent(session, {
    phase: "weapon_forge",
    action: "武器改装：安装静音模块",
    weaponId: "W-001",
    forgeBefore: { mods: [] },
    forgeAfter: { mods: ["silent"] },
    materialsConsumed: ["I-C01"],
    rngSeed: 42,
  });

  pushTraceEvent(session, {
    phase: "combat_score_player",
    action: "计算玩家战斗分",
    characterId: "player-1",
    weaponId: "W-001",
    baseValue: 3.5,
    weaponBonus: 2.0,
    finalValue: 28.5,
    rngSeed: 42,
  });

  finalizeTraceSession(session);

  assert.equal(session.events.length, 4);
  // 所有事件 seq 从 1 开始递增
  for (let i = 0; i < session.events.length; i++) {
    assert.equal(session.events[i]!.seq, i + 1);
  }
});
