import test from "node:test";
import assert from "node:assert/strict";

import { REVEAL_TIER_RANK } from "@/lib/registry/revealTierRank";
import { NPC_KNOWLEDGE_FACT_IDS } from "@/lib/npcKnowledge/npcBeliefGraph";
import { buildNpcKnowledgePacket } from "@/lib/npcKnowledge/npcKnowledgeResolver";
import { detectUnsupportedFacts } from "@/lib/worldFacts/unsupportedFactDetector";

function baseReport(overrides: Partial<Parameters<typeof detectUnsupportedFacts>[0]> = {}) {
  return detectUnsupportedFacts({
    narrative: "你沿着B1墙根往前走。",
    usedFactIds: [],
    allowedFactIds: [NPC_KNOWLEDGE_FACT_IDS.B1_PUBLIC_ANOMALY],
    scenePublicFactIds: [NPC_KNOWLEDGE_FACT_IDS.B1_PUBLIC_ANOMALY],
    actorScopedFactIds: [],
    maxRevealRank: REVEAL_TIER_RANK.surface,
    ...overrides,
  });
}

test("root cause explanation without factId is unsupported", () => {
  const report = baseReport({
    narrative: "N-001说，公寓的根因就是七锚闭环的真相。",
  });
  assert.ok(report.issueCodes.includes("unsupported_root_cause_claim"));
  assert.ok(report.unsupportedCandidates.some((candidate) => candidate.severity === "high"));
});

test("relationship claim without relation edge is unsupported", () => {
  const packet = buildNpcKnowledgePacket({
    speakerNpcId: "N-001",
    presentNpcIds: ["N-001"],
    location: "B1_SafeZone",
    floorId: "B1",
    maxRevealRank: 0,
    playerKnownFactIds: [],
    scenePublicFactIds: [],
    activeTaskIds: [],
  });
  const report = baseReport({
    narrative: "N-001说，他早就认识N-003，还欠N-003一条命。",
    npcKnowledgePacket: packet,
  });
  assert.ok(report.issueCodes.includes("unsupported_relationship_claim"));
  assert.ok(report.unsupportedCandidates.some((candidate) => candidate.text === "relationship_claim_without_used_fact_id"));
});

test("rumor written as certain fact is unsupported", () => {
  const report = baseReport({
    narrative: "电梯井昨晚吞了人，事情就是这样。",
    usedFactIds: [NPC_KNOWLEDGE_FACT_IDS.ELEVATOR_RUMOR],
    allowedFactIds: [NPC_KNOWLEDGE_FACT_IDS.ELEVATOR_RUMOR],
  });
  assert.ok(report.issueCodes.includes("unsupported_new_fact"));
  assert.ok(report.unsupportedCandidates.some((candidate) => candidate.severity === "medium"));
});

test("registry fact with allowed reveal tier passes", () => {
  const report = baseReport({
    narrative: "B1的灯闪过三次，墙内有轻微回声。",
    usedFactIds: [NPC_KNOWLEDGE_FACT_IDS.B1_PUBLIC_ANOMALY],
    allowedFactIds: [NPC_KNOWLEDGE_FACT_IDS.B1_PUBLIC_ANOMALY],
  });
  assert.equal(report.unsupportedCandidates.length, 0);
});

test("missing registry fact id is reported", () => {
  const report = baseReport({
    usedFactIds: ["fact:missing:ghost"],
    allowedFactIds: ["fact:missing:ghost"],
  });
  assert.ok(report.issueCodes.includes("used_fact_id_missing_from_registry"));
  assert.equal(
    report.unsupportedCandidates.find((candidate) => candidate.code === "used_fact_id_missing_from_registry")?.severity,
    "medium"
  );
});

test("location claim without supporting location fact is reported", () => {
  const report = baseReport({
    narrative: "你已经在B2的门后，冷水漫过脚踝。",
  });
  assert.ok(report.issueCodes.includes("unsupported_location_claim"));
  assert.equal(
    report.unsupportedCandidates.find((candidate) => candidate.code === "unsupported_location_claim")?.severity,
    "medium"
  );
});

test("location claim can be supported by state delta", () => {
  const report = baseReport({
    narrative: "我已经抵达B2的门后，冷水漫过脚踝。",
    stateDelta: { playerLocation: "B2_ExitThroat", taskUpdates: [], newTasks: [] },
    dmRecord: { player_location: "B2_ExitThroat" },
  });
  assert.ok(!report.issueCodes.includes("unsupported_location_claim"));
});

test("event stage claim without event fact is reported", () => {
  const report = baseReport({
    narrative: "走廊已经进入最终阶段，吞噬阶段开始了。",
  });
  assert.ok(report.issueCodes.includes("unsupported_event_stage_claim"));
});

test("reveal tier breach on used fact id is reported", () => {
  const report = baseReport({
    narrative: "N-010低声说，公寓根因已经贴近真正的源头。",
    usedFactIds: [NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_ROOT_TRUTH],
    allowedFactIds: [NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_ROOT_TRUTH],
    maxRevealRank: REVEAL_TIER_RANK.surface,
  });
  assert.ok(report.issueCodes.includes("fact_id_not_allowed"));
  assert.equal(
    report.unsupportedCandidates.find((candidate) => candidate.code === "fact_id_not_allowed")?.severity,
    "high"
  );
});

test("item acquisition without fact id or award is reported", () => {
  const report = baseReport({
    narrative: "我捡起那枚陌生徽章，把它放进口袋。",
    dmRecord: { awarded_items: [], awarded_warehouse_items: [] },
  });
  assert.ok(report.issueCodes.includes("unsupported_new_fact"));
  assert.ok(report.unsupportedCandidates.some((candidate) => candidate.text === "item_acquisition_without_fact_or_award"));
});

test("NPC deep role without fact id is reported", () => {
  const report = baseReport({
    narrative: "N-010其实是校源七锚之一。",
  });
  assert.ok(report.issueCodes.includes("unsupported_new_fact"));
  assert.equal(
    report.unsupportedCandidates.find((candidate) => candidate.text === "npc_identity_or_deep_role_without_fact_id")?.severity,
    "high"
  );
});

test("task completion without fact id or task delta is reported", () => {
  const report = baseReport({
    narrative: "委托已经完成，我终于能喘一口气。",
    stateDelta: { taskUpdates: [], newTasks: [] },
  });
  assert.ok(report.issueCodes.includes("unsupported_new_fact"));
  assert.ok(report.unsupportedCandidates.some((candidate) => candidate.text === "task_completion_without_fact_or_delta"));
});

test("candidate_new_facts are telemetry candidates only", () => {
  const report = baseReport({
    narrative: "我把这件事先记在心里，没有下结论。",
    candidateNewFacts: [
      {
        text: "老板旁边可能曾有银发女孩出现",
        category: "npc",
        confidence: 0.2,
        proposed_source: "player_observed",
      },
    ],
  });
  assert.equal(report.telemetry.candidateNewFactCount, 1);
  assert.ok(report.unsupportedCandidates.some((candidate) => candidate.text.startsWith("candidate_new_fact_pending_review")));
});
