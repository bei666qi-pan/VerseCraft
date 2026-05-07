import test from "node:test";
import assert from "node:assert/strict";

import { REVEAL_TIER_RANK } from "@/lib/registry/revealTierRank";
import { NPC_KNOWLEDGE_FACT_IDS } from "@/lib/npcKnowledge/npcBeliefGraph";
import { buildNpcKnowledgePacket } from "@/lib/npcKnowledge/npcKnowledgeResolver";
import {
  validateNpcKnowledgeInNarrative,
  type NpcKnowledgeValidationIssueCode,
} from "@/lib/npcKnowledge/npcKnowledgeValidator";

function packet(args: {
  speakerNpcId?: string;
  presentNpcIds?: string[];
  location?: string;
  floorId?: string | null;
  maxRevealRank?: number;
  scenePublicFactIds?: string[];
} = {}) {
  return buildNpcKnowledgePacket({
    speakerNpcId: args.speakerNpcId ?? "N-001",
    presentNpcIds: args.presentNpcIds ?? ["N-001"],
    location: args.location ?? "B1_SafeZone",
    floorId: args.floorId ?? "B1",
    maxRevealRank: args.maxRevealRank ?? REVEAL_TIER_RANK.surface,
    playerKnownFactIds: [],
    scenePublicFactIds: args.scenePublicFactIds ?? [NPC_KNOWLEDGE_FACT_IDS.B1_PUBLIC_ANOMALY],
    activeTaskIds: [],
  });
}

function validate(narrative: string, p = packet()) {
  return validateNpcKnowledgeInNarrative({
    narrative,
    speakerNpcId: p.speakerNpcId,
    npcKnowledgePacket: p,
    presentNpcIds: p.mentionable_npc_ids.filter((id) => id === p.speakerNpcId),
    maxRevealRank: REVEAL_TIER_RANK.surface,
  });
}

function hasIssue(report: ReturnType<typeof validate>, code: NpcKnowledgeValidationIssueCode): boolean {
  return report.issues.some((issue) => issue.code === code);
}

test("same-floor NPC may hint same-floor anomaly", () => {
  const report = validate("N-001贴着B1走廊的墙，低声说灯闪过三次，别追着声音走。");
  assert.equal(report.ok, true);
});

test("ordinary NPC does not know apartment root cause", () => {
  const report = validate("N-001说，公寓的根因就是七锚闭环的真相。");
  assert.ok(hasIssue(report, "root_cause_leak"));
});

test("core NPC may hint cause fragment at deep reveal", () => {
  const p = packet({
    speakerNpcId: "N-010",
    presentNpcIds: ["N-010"],
    maxRevealRank: REVEAL_TIER_RANK.deep,
  });
  const report = validate("N-010看着墙缝，说校源像一块没拼上的碎片，还不能往下说。", p);
  assert.equal(report.ok, true);
});

test("core NPC cannot state root truth below root reveal", () => {
  const p = packet({
    speakerNpcId: "N-010",
    presentNpcIds: ["N-010"],
    maxRevealRank: REVEAL_TIER_RANK.deep,
  });
  const report = validate("N-010说，真正的源头就是纠错员。", p);
  assert.ok(hasIssue(report, "root_cause_leak"));
});

test("ordinary NPC must not talk root truth", () => {
  const report = validate("N-001忽然笃定地说，真正原因藏在校源的根因里。");
  assert.ok(hasIssue(report, "root_cause_leak"));
});

test("NPC cannot suddenly know an unlinked stranger NPC", () => {
  const report = validate("N-777站在门口，像早就和N-001约好了。");
  assert.ok(hasIssue(report, "npc_mentions_unknown_npc"));
});

test("relation edge allows mentioning the related NPC", () => {
  const p = packet({ speakerNpcId: "N-001", presentNpcIds: ["N-001"], maxRevealRank: 0 });
  const report = validate("N-001说，N-002住在隔壁，昨晚也听见了B1的响动。", p);
  assert.equal(hasIssue(report, "npc_mentions_unknown_npc"), false);
});

test("private relation talk requires an edge", () => {
  const report = validate("N-001说，N-003欠了我一条命。");
  assert.ok(hasIssue(report, "npc_relationship_fabrication"));
});

test("rumor cannot be stated as fact", () => {
  const report = validate("N-001说，电梯井昨晚吞了人，事情就是这样。");
  assert.ok(hasIssue(report, "rumor_stated_as_fact"));
});

test("rumor with uncertainty language is accepted", () => {
  const report = validate("N-001说，听说电梯井昨晚吞过人，别把这话当真。");
  assert.equal(hasIssue(report, "rumor_stated_as_fact"), false);
});

test("misunderstood belief cannot be stated as truth", () => {
  const report = validate("N-001说，七层很安全，你直接上去就行。");
  assert.ok(hasIssue(report, "npc_knows_forbidden_fact"));
});

test("low reveal tier blocks high-tier cause fragment", () => {
  const p = packet({
    speakerNpcId: "N-010",
    presentNpcIds: ["N-010"],
    maxRevealRank: REVEAL_TIER_RANK.fracture,
  });
  const report = validate("N-010说，校源碎片已经贴在你身后。", p);
  assert.ok(hasIssue(report, "npc_knows_forbidden_fact"));
});

test("NPC outside presentNpcIds should not suddenly enter scene", () => {
  const report = validate("N-003推门进来，像一直站在B1门外等候。");
  assert.ok(hasIssue(report, "npc_mentions_unknown_npc"));
});
