import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlayerWorldSignals } from "./playerWorldSignals";
import { computeMaxRevealRankFromSignals, listFiredRevealRuleIds } from "./revealRegistry";
import { REVEAL_TIER_RANK } from "./revealTierRank";

const BASE_CTX = "游戏时间[第1日 9时]。用户位置[B1_SafeZone]。";

test("parsePlayerWorldSignals：无理智状态信号时 sanityRatio=null，sanityBand=unknown（安全默认）", () => {
  const s = parsePlayerWorldSignals(BASE_CTX, null);
  assert.equal(s.sanityRatio, null);
  assert.equal(s.sanityBand, "unknown");
});

test("parsePlayerWorldSignals：正确解析 理智状态[current/hist] 为比值与档位", () => {
  const s = parsePlayerWorldSignals(`${BASE_CTX}理智状态[10/50]。`, null);
  assert.equal(s.sanityRatio, 0.2);
  assert.equal(s.sanityBand, "critical");
});

test("parsePlayerWorldSignals：理智充裕时判定为 stable，不受其他信号干扰", () => {
  const s = parsePlayerWorldSignals(`${BASE_CTX}理智状态[48/50]。`, null);
  assert.equal(s.sanityBand, "stable");
});

test("G1：无任何信号时 maxRevealRank 仍保守（surface），不会因 sanityBand=unknown 误触发", () => {
  const s = parsePlayerWorldSignals(BASE_CTX, "B1_SafeZone");
  const rank = computeMaxRevealRankFromSignals(s);
  assert.equal(rank, REVEAL_TIER_RANK.surface);
  assert.ok(!listFiredRevealRuleIds(s).some((id) => id.startsWith("sanity_")));
});

test("G1：sanityBand=fractured 时至少抬到 fracture 层", () => {
  const s = parsePlayerWorldSignals(`${BASE_CTX}理智状态[18/50]。`, null); // ratio=0.36 -> fractured
  assert.equal(s.sanityBand, "fractured");
  const rank = computeMaxRevealRankFromSignals(s);
  assert.ok(rank >= REVEAL_TIER_RANK.fracture);
  assert.ok(listFiredRevealRuleIds(s).includes("sanity_fractured"));
});

test("G1：sanityBand=critical 时至少抬到 deep 层，且不高于既有 conspiracy/profession 规则触发的上限", () => {
  const s = parsePlayerWorldSignals(`${BASE_CTX}理智状态[5/50]。`, null); // ratio=0.1 -> critical
  assert.equal(s.sanityBand, "critical");
  const rank = computeMaxRevealRankFromSignals(s);
  assert.ok(rank >= REVEAL_TIER_RANK.deep);
  assert.ok(rank < REVEAL_TIER_RANK.abyss, "理智濒崩不应单独直接解锁 abyss（仍需 B2/出口类信号）");
  assert.ok(listFiredRevealRuleIds(s).includes("sanity_critical"));
});

test("G1：strained 档位不触发任何 sanity_* 门禁规则（只有 fractured/critical 才联动）", () => {
  const s = parsePlayerWorldSignals(`${BASE_CTX}理智状态[30/50]。`, null); // ratio=0.6 -> strained
  assert.equal(s.sanityBand, "strained");
  const fired = listFiredRevealRuleIds(s);
  assert.ok(!fired.some((id) => id.startsWith("sanity_")));
});
