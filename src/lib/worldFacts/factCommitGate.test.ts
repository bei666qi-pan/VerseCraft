import test from "node:test";
import assert from "node:assert/strict";

import { REVEAL_TIER_RANK } from "@/lib/registry/revealTierRank";
import { NPC_KNOWLEDGE_FACT_IDS } from "@/lib/npcKnowledge/npcBeliefGraph";
import { gateFactCommit, type WorldFactCommitCandidate } from "@/lib/worldFacts/factCommitGate";
import type { NarrativeValidationIssue } from "@/lib/turnEngine/validateNarrative";

function gate(overrides: Partial<Parameters<typeof gateFactCommit>[0]> = {}) {
  return gateFactCommit({
    resolvedDmTurn: { narrative: "B1的灯闪了三次。" },
    candidateFacts: [],
    validatorIssues: [],
    maxRevealRank: REVEAL_TIER_RANK.surface,
    ...overrides,
  });
}

function candidate(overrides: Partial<WorldFactCommitCandidate> = {}): WorldFactCommitCandidate {
  return {
    factId: NPC_KNOWLEDGE_FACT_IDS.B1_PUBLIC_ANOMALY,
    content: "B1 anomaly observed.",
    category: "floor",
    truthLevel: "canon",
    source: "registry",
    ownerNpcIds: [],
    floorIds: ["B1"],
    relatedNpcIds: [],
    revealTier: REVEAL_TIER_RANK.surface,
    ...overrides,
  };
}

test("canon registry fact can commit when metadata and reveal tier pass", () => {
  const result = gate({ candidateFacts: [candidate()] });
  assert.equal(result.allowedFacts.length, 1);
  assert.equal(result.rejectedFacts.length, 0);
});

test("candidate fact cannot directly commit", () => {
  const result = gate({ candidateFacts: [candidate({ truthLevel: "candidate" })] });
  assert.equal(result.allowedFacts.length, 0);
  assert.equal(result.rejectedFacts[0]?.reason, "candidate_truth_level");
});

test("rumor stated as certain fact is rejected", () => {
  const result = gate({
    resolvedDmTurn: { narrative: "电梯井昨晚吞了人，事情就是这样。" },
    candidateFacts: [
      candidate({
        factId: NPC_KNOWLEDGE_FACT_IDS.ELEVATOR_RUMOR,
        category: "anomaly",
        truthLevel: "rumor",
        source: "npc_belief",
      }),
    ],
  });
  assert.equal(result.rejectedFacts[0]?.reason, "uncertain_fact_stated_as_truth");
});

test("unsupported root cause blocks commit", () => {
  const issue: NarrativeValidationIssue = {
    code: "unsupported_root_cause_claim",
    severity: "high",
  };
  const result = gate({
    validatorIssues: [issue],
    candidateFacts: [
      candidate({
        factId: NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_ROOT_TRUTH,
        category: "apartment_root",
        truthLevel: "canon",
        revealTier: REVEAL_TIER_RANK.abyss,
      }),
    ],
    maxRevealRank: REVEAL_TIER_RANK.abyss,
  });
  assert.equal(result.shouldBlockCommit, true);
  assert.ok(result.rewriteHints.includes("rewrite_root_cause_as_unavailable_or_hint"));
});

test("unsupported relationship candidate is not committed", () => {
  const issue: NarrativeValidationIssue = {
    code: "unsupported_relationship_claim",
    severity: "medium",
  };
  const result = gate({
    validatorIssues: [issue],
    candidateFacts: [
      candidate({
        factId: "fact:relationship:N-001:N-002:neighbor",
        category: "relationship",
        truthLevel: "canon",
      }),
    ],
  });
  assert.equal(result.allowedFacts.length, 0);
  assert.equal(result.rejectedFacts[0]?.reason, "unsupported_relationship");
});

test("world_engine candidate does not pollute narrative without precondition", () => {
  const result = gate({
    resolvedDmTurn: { narrative: "像是B1第一波压力又回来了。" },
    candidateFacts: [
      candidate({
        factId: "fact:event:B1:first_pressure_wave",
        category: "event",
        truthLevel: "hypothesis",
        source: "world_engine",
      }),
    ],
  });
  assert.equal(result.allowedFacts.length, 0);
  assert.equal(result.rejectedFacts[0]?.reason, "world_engine_candidate_requires_precondition");
});

test("player forged candidate does not become committed fact", () => {
  const result = gate({
    candidateFacts: [
      candidate({
        factId: "fact:player:forged_root",
        content: "Player claimed the root cause.",
        category: "apartment_root",
        truthLevel: "candidate",
        source: "player_observed",
      }),
    ],
  });
  assert.equal(result.allowedFacts.length, 0);
  assert.ok(result.rejectedFacts.length > 0);
});
