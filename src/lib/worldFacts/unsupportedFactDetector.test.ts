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
});

test("rumor written as certain fact is unsupported", () => {
  const report = baseReport({
    narrative: "电梯井昨晚吞了人，事情就是这样。",
    usedFactIds: [NPC_KNOWLEDGE_FACT_IDS.ELEVATOR_RUMOR],
    allowedFactIds: [NPC_KNOWLEDGE_FACT_IDS.ELEVATOR_RUMOR],
  });
  assert.ok(report.issueCodes.includes("unsupported_new_fact"));
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
});

test("location claim without supporting location fact is reported", () => {
  const report = baseReport({
    narrative: "你已经在B2的门后，冷水漫过脚踝。",
  });
  assert.ok(report.issueCodes.includes("unsupported_location_claim"));
});

test("event stage claim without event fact is reported", () => {
  const report = baseReport({
    narrative: "走廊已经进入最终阶段，吞噬阶段开始了。",
  });
  assert.ok(report.issueCodes.includes("unsupported_event_stage_claim"));
});
