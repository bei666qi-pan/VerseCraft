import assert from "node:assert/strict";
import { test } from "node:test";
import {
  REVEAL_TIER_RANK,
  filterCandidatesByRevealTier,
  getFactRevealMinRank,
  inferMaxRevealRank,
} from "./revealGate";
import type { LoreFact, RetrievalCandidate } from "../types";

test("首日 B1：揭露层停留在 surface", () => {
  const ctx =
    "游戏时间[第1日 8时]。用户位置[B1_SafeZone]。锚点解锁：B1[1]，1F[0]，7F[0]。";
  assert.equal(inferMaxRevealRank(ctx, "B1_SafeZone"), REVEAL_TIER_RANK.surface);
});

test("第2日或复活：至少 fracture", () => {
  const ctx =
    "游戏时间[第2日 8时]。用户位置[B1_Storage]。最近复活：死亡地点[x]，死因[y]，掉落数量[1]，最近锚点[z]。";
  assert.equal(inferMaxRevealRank(ctx, "B1_Storage"), REVEAL_TIER_RANK.fracture);
});

test("7F 锚点或身处 7F：deep", () => {
  const ctx = "游戏时间[第2日 8时]。用户位置[1F_Lobby]。锚点解锁：B1[1]，1F[1]，7F[1]。";
  assert.equal(inferMaxRevealRank(ctx, "1F_Lobby"), REVEAL_TIER_RANK.deep);
  assert.equal(inferMaxRevealRank("游戏时间[第1日 8时]。", "7F_Bench"), REVEAL_TIER_RANK.deep);
});

test("B2 位置：abyss", () => {
  assert.equal(inferMaxRevealRank("游戏时间[第1日 8时]。", "B2_Passage"), REVEAL_TIER_RANK.abyss);
});

test("事实层级标签：system canon 需要 fracture+", () => {
  const fact: LoreFact = {
    identity: { factKey: "core:apartment_system_canon" },
    layer: "core_canon",
    factType: "world_mechanism",
    canonicalText: "x",
    source: { kind: "registry" },
    tags: ["reveal_fracture"],
  };
  assert.equal(getFactRevealMinRank(fact), REVEAL_TIER_RANK.fracture);
  const surfaceOk: RetrievalCandidate[] = [{ fact, score: 10, debug: { from: "exact" } }];
  assert.equal(
    filterCandidatesByRevealTier(surfaceOk, REVEAL_TIER_RANK.surface).length,
    0
  );
  assert.equal(
    filterCandidatesByRevealTier(surfaceOk, REVEAL_TIER_RANK.fracture).length,
    1
  );
});
