import test from "node:test";
import assert from "node:assert/strict";

import {
  canNpcMentionOtherNpc,
  getNpcRelationEdges,
  getSharedKnowledgeFactIds,
} from "@/lib/npcRelations/npcRelationGraph";
import { NPC_KNOWLEDGE_FACT_IDS } from "@/lib/npcKnowledge/npcBeliefGraph";

test("relation graph exposes direct edges for a known NPC", () => {
  const edges = getNpcRelationEdges("N-001");
  assert.ok(edges.some((edge) => edge.toNpcId === "N-002" && edge.relationType === "neighbor"));
});

test("relation graph blocks unlinked NPC mention", () => {
  assert.equal(canNpcMentionOtherNpc("N-001", "N-777", 3), false);
});

test("relation graph reveal tier gates higher relation edges", () => {
  assert.equal(canNpcMentionOtherNpc("N-003", "N-010", 1), false);
  assert.equal(canNpcMentionOtherNpc("N-003", "N-010", 2), true);
});

test("relation graph returns shared fact ids only through visible edges", () => {
  const low = getSharedKnowledgeFactIds("N-003", "N-010", 1);
  assert.equal(low.includes(NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_FRAGMENT), false);

  const high = getSharedKnowledgeFactIds("N-003", "N-010", 2);
  assert.ok(high.includes(NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_FRAGMENT));
});
