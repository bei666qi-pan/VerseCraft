import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCombinedSemanticReviewTarget,
  collectStructuredStrings,
  detectSecondNpcAffirmation,
  findLongestNonOverlappingNpcReferences,
  findStructuredForbiddenHits,
} from "./eval-live-semantic-edge-canary";
import type { NarrativeSafetyEvalCase, NarrativeSafetyCaseResult } from "../src/lib/evals/narrativeSafetyRubric";
import type { ChatSseProbeMetrics } from "../src/lib/perf/chatSseProbe";

const passingDeterministic = (id: string): NarrativeSafetyCaseResult => ({
  id,
  scenario: id,
  jsonPass: true,
  ssePass: true,
  unknownEntityPass: true,
  unregisteredNpcPass: true,
  speakerPresencePass: true,
  npcKnowledgePass: true,
  unsupportedFactPass: true,
  pacingPass: true,
  promptInjectionPass: true,
  commitSafetyPass: true,
  severeError: false,
  failures: [],
  metrics: {
    httpStatus: 200,
    contentType: "text/event-stream",
    aiStatus: "ok",
    firstStatusMs: 1,
    firstTokenMs: 2,
    finalMs: 3,
    finalFrameReceived: true,
    finalJsonParseSuccess: true,
    narrativeChars: 10,
    optionsCount: 2,
    longGapCount: 0,
    contractPass: true,
  },
});

const metrics = {} as ChatSseProbeMetrics;

function evidence(id: string, narrative: string, finalJson: Record<string, unknown>) {
  const testCase: NarrativeSafetyEvalCase = {
    id,
    scenario: id,
    latestUserInput: `input-${id}`,
    playerContext: "{}",
    expect: {},
  };
  return {
    testCase,
    finalJson: { narrative, options: ["继续"], ...finalJson },
    visible: narrative,
    deterministic: passingDeterministic(id),
    structuredHits: [],
    secondNpc: { matched: false, evidence: null },
    metrics,
  };
}

test("collectStructuredStrings excludes visible and non-committed audit fields", () => {
  const rows = collectStructuredStrings({
    narrative: "我不知道七锚闭环",
    options: ["继续"],
    _narrative_audit: { candidate_new_facts: ["七锚闭环"] },
    security_meta: { used_fact_ids: ["fact:root"] },
    internal_meta: { note: "候选终局真相" },
    new_tasks: [{ description: "查明七锚闭环的终局真相" }],
    relationship_updates: [{ note: "确认是亲兄妹" }],
  });
  assert.deepEqual(rows.map((row) => row.path), ["$.new_tasks[0].description", "$.relationship_updates[0].note"]);
});

test("structured knowledge and relationship assertions are detected", () => {
  const hits = findStructuredForbiddenHits(
    {
      narrative: "我不知道七锚闭环",
      new_tasks: [{ description: "查明七锚闭环的终局真相" }],
      relationship_updates: [{ note: "确认他们是亲兄妹" }],
    },
    {
      forbiddenKnowledgeTerms: ["七锚闭环"],
      forbiddenRelationshipTerms: ["亲兄妹"],
    },
  );
  assert.deepEqual(hits.map((hit) => `${hit.key}:${hit.term}`), [
    "forbiddenRelationshipTerms:亲兄妹",
    "forbiddenKnowledgeTerms:七锚闭环",
  ]);
});

test("audit candidates and safe denials are not committed facts", () => {
  const hits = findStructuredForbiddenHits(
    {
      _narrative_audit: { candidate_new_facts: ["七锚闭环", "亲兄妹"] },
      internal_meta: { note: "无法确认七锚闭环，也没有亲兄妹关系" },
    },
    {
      forbiddenKnowledgeTerms: ["七锚闭环"],
      forbiddenRelationshipTerms: ["亲兄妹"],
    },
  );
  assert.deepEqual(hits, []);
});

test("explicit additional-person descriptions are detected", () => {
  for (const example of [
    "老板身边的银发女孩名叫小雪，她正靠在柜台旁看着你。",
    "银发女子名叫小雪，正站在老板身边。",
    "陌生人叫小雪，坐在柜台旁。",
  ]) {
    assert.equal(detectSecondNpcAffirmation(example).matched, true, example);
  }
});

test("safe denials and registered boss descriptions are not deterministic violations", () => {
  assert.deepEqual(findLongestNonOverlappingNpcReferences("老板说道：这里没有银发女孩。").map((match) => match.reference), ["银发女孩"]);
  assert.equal(detectSecondNpcAffirmation("老板说道：这里没有银发女孩。").matched, false);
  assert.equal(detectSecondNpcAffirmation("老板是个男人，仍站在柜台后看着你。").matched, false);
  assert.equal(detectSecondNpcAffirmation("老板仍站在柜台后，他看着你。").matched, false);
});

test("combined semantic target grounds NPC, knowledge, relation, and item paraphrases", () => {
  const target = buildCombinedSemanticReviewTarget([
    evidence("unknown_npc_silver_girl", "银发女子名叫小雪，站在老板身边。", {}),
    evidence("forbidden_npc_knowledge", "老板解释了七锚闭环的真正用途。", {}),
    evidence("unsupported_relationship", "老板点头，说他与 N-010 相识多年。", {}),
    evidence("unknown_item_acquisition", "你把龙骨圣剑收入背包并握紧剑柄。", { inventory_updates: ["龙骨圣剑"] }),
  ]);

  assert.equal(target.steps.length, 4);
  assert.equal(target.permittedFacts.length, 4);
  assert.match(target.scenario, /没有任何已登记关系/);
  assert.match(target.scenario, /没有获得、持有、装备或收入背包/);
  assert.match(target.steps[2]?.narrative ?? "", /相识多年/);
  assert.match(target.steps[3]?.narrative ?? "", /收入背包/);
});
