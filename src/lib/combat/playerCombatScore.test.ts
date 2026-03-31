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

