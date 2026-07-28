import test from "node:test";
import assert from "node:assert/strict";
import {
  collectStructuredStrings,
  detectSecondNpcAffirmation,
  findStructuredForbiddenHits,
} from "./eval-live-semantic-edge-canary";

test("collectStructuredStrings excludes root player-visible fields", () => {
  const rows = collectStructuredStrings({
    narrative: "我不知道七锚闭环",
    options: ["继续"],
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

test("structured safe denial is not treated as a committed fact", () => {
  const hits = findStructuredForbiddenHits(
    { internal_meta: { note: "无法确认七锚闭环，也没有亲兄妹关系" } },
    {
      forbiddenKnowledgeTerms: ["七锚闭环"],
      forbiddenRelationshipTerms: ["亲兄妹"],
    },
  );
  assert.deepEqual(hits, []);
});

test("arbitrary second NPC affirmation is detected without relying on a fixed name", () => {
  const result = detectSecondNpcAffirmation("老板身边的银发女孩名叫小雪，她正靠在柜台旁看着你。");
  assert.equal(result.matched, true);
  assert.match(result.evidence ?? "", /小雪/);
});

test("safe second NPC denial and questions are not treated as affirmations", () => {
  assert.equal(detectSecondNpcAffirmation("这里没有银发女孩，柜台旁只有老板。").matched, false);
  assert.equal(detectSecondNpcAffirmation("你提到的女孩是谁？这里暂时无法确认。").matched, false);
});

test("pronoun-only second NPC affirmation is detected", () => {
  assert.equal(detectSecondNpcAffirmation("她叫小雪，正站在老板身边。").matched, true);
  assert.equal(detectSecondNpcAffirmation("她并不存在。").matched, false);
});
