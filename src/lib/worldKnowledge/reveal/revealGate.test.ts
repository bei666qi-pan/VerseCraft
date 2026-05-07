import assert from "node:assert/strict";
import { test } from "node:test";
import {
  REVEAL_TIER_RANK,
  filterCandidatesByRevealTier,
  gateCandidatesForLorePacket,
  gateCandidatesForLorePacketV1,
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

test("surface rank blocks deep facts instead of falling back to ungated candidates", () => {
  const deepFact: LoreFact = {
    identity: { factKey: "truth:deep_identity" },
    layer: "core_canon",
    factType: "world_mechanism",
    canonicalText: "deep identity must not be injected at surface",
    source: { kind: "registry" },
    tags: ["reveal_deep"],
  };
  const candidates: RetrievalCandidate[] = [{ fact: deepFact, score: 100, debug: { from: "exact" } }];
  assert.equal(gateCandidatesForLorePacket(candidates, REVEAL_TIER_RANK.surface).length, 0);

  const detailed = gateCandidatesForLorePacketV1(candidates, { maxRank: REVEAL_TIER_RANK.surface });
  assert.equal(detailed.included.length, 0);
  assert.equal(detailed.blocked.length, 1);
  assert.match(detailed.blocked[0]!.gateReason, /reveal_rank/);
});

test("dm_only facts are blocked from NPC/player lore context", () => {
  const dmOnlyFact: LoreFact = {
    identity: { factKey: "dm_only:school_anchor" },
    layer: "core_canon",
    factType: "system_hint",
    canonicalText: "dm only truth",
    source: { kind: "registry" },
    tags: ["dm_only", "reveal_surface"],
  };
  const result = gateCandidatesForLorePacketV1(
    [{ fact: dmOnlyFact, score: 90 }],
    { maxRank: REVEAL_TIER_RANK.deep, actorNpcId: "N-010", presentNpcIds: ["N-010"] }
  );
  assert.equal(result.included.length, 0);
  assert.equal(result.blocked.length, 1);
  assert.match(result.blocked[0]!.gateReason, /truth_class:dm_only/);
});
