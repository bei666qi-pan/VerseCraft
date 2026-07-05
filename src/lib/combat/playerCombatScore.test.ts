import test from "node:test";
import assert from "node:assert/strict";
import { computePlayerCombatScore } from "./playerCombatScore";

test("computePlayerCombatScore: 武器污染/不稳会降低 score", () => {
  const base = computePlayerCombatScore({
    stats: { sanity: 12, agility: 12, luck: 10, charm: 10, background: 10 },
    equippedWeapon: { id: "w1" } as any,
    threatPhase: "idle",
  });
  const worse = computePlayerCombatScore({
    stats: { sanity: 12, agility: 12, luck: 10, charm: 10, background: 10 },
    equippedWeapon: { id: "w1", stability: 42, contamination: 55, repairable: true } as any,
    threatPhase: "idle",
  });
  assert.ok(worse.score < base.score);
});

test("computePlayerCombatScore: active/breached 压力更大", () => {
  const idle = computePlayerCombatScore({
    stats: { sanity: 12, agility: 12, luck: 10, charm: 10, background: 10 },
    equippedWeapon: null,
    threatPhase: "idle",
  });
  const breached = computePlayerCombatScore({
    stats: { sanity: 12, agility: 12, luck: 10, charm: 10, background: 10 },
    equippedWeapon: null,
    threatPhase: "breached",
  });
  assert.ok(breached.score > 0);
  assert.ok(breached.score <= idle.score + 2); // 第一版只是压缩容错，不做大幅波动
});

// Stage-4：职业进入战力计算（此前 computePlayerCombatScore 完全不认识 profession 参数）。
test("computePlayerCombatScore: 已认证职业提供小幅稳定加成", () => {
  const stats = { sanity: 12, agility: 12, luck: 10, charm: 10, background: 10 };
  const noProfession = computePlayerCombatScore({ stats, equippedWeapon: null, threatPhase: "idle" });
  const withProfession = computePlayerCombatScore({
    stats,
    equippedWeapon: null,
    threatPhase: "idle",
    profession: "守灯人",
  });
  assert.ok(withProfession.score > noProfession.score);
});

test("computePlayerCombatScore: 职业倾向与冲突类型契合时加成更高", () => {
  const stats = { sanity: 12, agility: 12, luck: 10, charm: 10, background: 10 };
  const offAffinity = computePlayerCombatScore({
    stats,
    equippedWeapon: null,
    threatPhase: "idle",
    profession: "巡迹客",
    kind: "intimidate", // 巡迹客的倾向是 escape，不是 intimidate
  });
  const onAffinity = computePlayerCombatScore({
    stats,
    equippedWeapon: null,
    threatPhase: "idle",
    profession: "巡迹客",
    kind: "escape",
  });
  assert.ok(onAffinity.score > offAffinity.score);
});

test("computePlayerCombatScore: 职业主动已发动时额外加成", () => {
  const stats = { sanity: 12, agility: 12, luck: 10, charm: 10, background: 10 };
  const idle = computePlayerCombatScore({
    stats,
    equippedWeapon: null,
    threatPhase: "idle",
    profession: "守灯人",
    professionActiveEngaged: false,
  });
  const engaged = computePlayerCombatScore({
    stats,
    equippedWeapon: null,
    threatPhase: "idle",
    profession: "守灯人",
    professionActiveEngaged: true,
  });
  assert.ok(engaged.score > idle.score);
});

// Stage-4：武器阶级/继承效果此前只是展示字段，不影响战力；现在应真正提供加成。
test("computePlayerCombatScore: 高阶武器（tier）提供更高战力", () => {
  const stats = { sanity: 12, agility: 12, luck: 10, charm: 10, background: 10 };
  const tierC = computePlayerCombatScore({
    stats,
    equippedWeapon: { id: "w1", stability: 70, contamination: 0, tier: "C" } as any,
    threatPhase: "idle",
  });
  const tierS = computePlayerCombatScore({
    stats,
    equippedWeapon: { id: "w1", stability: 70, contamination: 0, tier: "S" } as any,
    threatPhase: "idle",
  });
  assert.ok(tierS.score > tierC.score);
});

// Stage-4：验收标准——“用对武器获得窗口”。武器 counterTags/currentMods 命中对方 vulnerableToTags 时应有加成。
test("computePlayerCombatScore: 武器命中对方弱点标签时提供窗口加成", () => {
  const stats = { sanity: 12, agility: 12, luck: 10, charm: 10, background: 10 };
  const weapon = { id: "w1", stability: 70, contamination: 0, counterTags: ["mirror", "direction"] } as any;
  const noMatch = computePlayerCombatScore({
    stats,
    equippedWeapon: weapon,
    threatPhase: "idle",
    opponentVulnerableTags: ["cognition"],
  });
  const matched = computePlayerCombatScore({
    stats,
    equippedWeapon: weapon,
    threatPhase: "idle",
    opponentVulnerableTags: ["mirror"],
  });
  assert.ok(matched.score > noMatch.score);
});

test("computePlayerCombatScore: styleTags 反映职业倾向而不是恒定 close_quarters", () => {
  const stats = { sanity: 12, agility: 12, luck: 10, charm: 10, background: 10 };
  const result = computePlayerCombatScore({
    stats,
    equippedWeapon: null,
    threatPhase: "idle",
    profession: "齐日角",
  });
  assert.ok(result.styleTags.includes("tradecraft"));
});

