import assert from "node:assert/strict";
import test from "node:test";
import { softenPendingCandidateFacts } from "./candidateNarrativeGuard";

test("softens a paraphrased candidate fact instead of requiring exact text", () => {
  const result = softenPendingCandidateFacts({
    narrative: "一个穿物业制服的女孩——欣蓝，胸牌写着‘实习’——正看着我。大堂灯光很暗。",
    candidates: [{ text: "欣蓝是实习物业，可能对公寓情况熟悉", category: "relationship", confidence: 0.3, proposed_source: "npc_belief" }],
  });
  assert.equal(result.rewritten, true);
  assert.match(result.narrative, /尚不能证明背后的事实/);
  assert.equal(result.narrative.includes("大堂灯光很暗"), true);
});

test("does not touch unrelated atmosphere or already uncertain prose", () => {
  const candidate = [{ text: "欣蓝是实习物业", category: "relationship" as const, confidence: 0.3, proposed_source: "npc_belief" as const }];
  assert.equal(softenPendingCandidateFacts({ narrative: "日光灯嗡嗡作响。", candidates: candidate }).rewritten, false);
  assert.equal(softenPendingCandidateFacts({ narrative: "欣蓝似乎穿着物业制服，也许只是借来的。", candidates: candidate }).rewritten, false);
});
