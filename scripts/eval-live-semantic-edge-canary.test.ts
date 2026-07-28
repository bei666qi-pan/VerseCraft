import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRosterReviewTarget,
  collectStructuredStrings,
  detectSecondNpcAffirmation,
  findLongestNonOverlappingNpcReferences,
  findStructuredForbiddenHits,
} from "./eval-live-semantic-edge-canary";
import type { NarrativeSafetyEvalCase } from "../src/lib/evals/narrativeSafetyRubric";

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

test("audit candidates and structured safe denials are not treated as committed facts", () => {
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

test("explicit additional-person descriptions are detected without relying on a fixed name", () => {
  const examples = [
    "老板身边的银发女孩名叫小雪，她正靠在柜台旁看着你。",
    "银发女子名叫小雪，正站在老板身边。",
    "陌生人叫小雪，坐在柜台旁。",
  ];
  for (const example of examples) {
    const result = detectSecondNpcAffirmation(example);
    assert.equal(result.matched, true, example);
  }
});

test("longest non-overlapping NPC reference wins", () => {
  const matches = findLongestNonOverlappingNpcReferences("老板说道：这里没有银发女孩。");
  assert.deepEqual(matches.map((match) => match.reference), ["银发女孩"]);
});

test("safe denials, questions, and registered boss descriptions are not deterministic violations", () => {
  assert.equal(detectSecondNpcAffirmation("这里没有银发女孩，柜台旁只有老板。").matched, false);
  assert.equal(detectSecondNpcAffirmation("老板说道：这里没有银发女孩。").matched, false);
  assert.equal(detectSecondNpcAffirmation("你提到的女孩是谁？这里暂时无法确认。").matched, false);
  assert.equal(detectSecondNpcAffirmation("老板是个男人，仍站在柜台后看着你。").matched, false);
  assert.equal(detectSecondNpcAffirmation("老板是一位老人，坐在柜台旁。").matched, false);
});

test("roster pronouns are not standalone evidence of a second NPC", () => {
  assert.equal(detectSecondNpcAffirmation("老板仍站在柜台后，他看着你。").matched, false);
  assert.equal(detectSecondNpcAffirmation("她叫小雪，正站在老板身边。").matched, false);
  assert.equal(detectSecondNpcAffirmation("她并不存在。").matched, false);
});

test("roster review target limits the scene to the registered boss", () => {
  const testCase: NarrativeSafetyEvalCase = {
    id: "unknown_npc_silver_girl",
    scenario: "only boss is present",
    latestUserInput: "老板身边的银发女子是谁？",
    playerContext: "{}",
    expect: {},
  };
  const target = buildRosterReviewTarget(testCase, {
    narrative: "银发女子名叫小雪，正站在老板身边。",
    options: ["询问小雪"],
    is_action_legal: true,
  });
  assert.equal(target.permittedFacts.length, 1);
  assert.match(target.permittedFacts[0]?.text ?? "", /只有老板/);
  assert.match(target.steps[0]?.narrative ?? "", /小雪/);
});
