import test from "node:test";
import assert from "node:assert/strict";
import { buildContentQualityMetricsSnapshot } from "@/lib/admin/contentQualityMetrics";

test("content quality snapshot returns structured empty data", () => {
  const result = buildContentQualityMetricsSnapshot({});

  assert.equal(result.sampleSize, 0);
  assert.equal(result.evidenceSufficiency, "insufficient");
  assert.deepEqual(result.worldSelections, []);
  assert.deepEqual(result.chapters.entered, []);
  assert.deepEqual(result.npcInteractions.rank, []);
  assert.equal(result.retryRegenerationCount, 0);
  assert.equal(result.validatorIssues.total, 0);
});

test("content quality snapshot aggregates world, chapter, npc, retry, and feedback metrics", () => {
  const result = buildContentQualityMetricsSnapshot({
    worldSelectionRows: [{ worldId: "dark_moon", count: 25 }],
    worldFirstActionRows: [{ worldId: "dark_moon", count: 20 }],
    chapterRows: [
      { eventName: "chapter_entered", worldId: "dark_moon", chapterId: "ch1", count: 25 },
      { eventName: "chapter_completed", worldId: "dark_moon", chapterId: "ch1", count: 15 },
      { eventName: "chapter_abandoned", worldId: "dark_moon", chapterId: "ch1", count: 5 },
    ],
    npcRows: [
      { eventName: "npc_interaction_started", npcId: "N-015", count: 10 },
      { eventName: "npc_interaction_completed", npcId: "N-015", count: 7 },
      { eventName: "npc_interaction_failed", npcId: "N-015", count: 2 },
    ],
    retryRows: [
      { eventName: "retry_clicked", count: 3 },
      { eventName: "regen_clicked", count: 4 },
    ],
    feedbackSampleSize: 10,
    negativeFeedbackCount: 4,
    surveySampleSize: 6,
  });

  assert.equal(result.evidenceSufficiency, "enough");
  assert.equal(result.worldSelections[0]?.firstActionRate, 0.8);
  assert.equal(result.worldFirstActionRate, 0.8);
  assert.equal(result.chapters.completionRate, 0.6);
  assert.equal(result.chapters.abandonRate, 0.2);
  assert.equal(result.npcInteractions.rank[0]?.npcId, "N-015");
  assert.equal(result.npcInteractions.rank[0]?.completionRate, 0.7);
  assert.equal(result.retryRegenerationCount, 7);
  assert.equal(result.retryRegeneration.retryCount, 3);
  assert.equal(result.retryRegeneration.regenCount, 4);
  assert.equal(result.negativeFeedbackRate, 0.4);
});

test("content quality snapshot marks insufficient sample below 20", () => {
  const result = buildContentQualityMetricsSnapshot({
    worldSelectionRows: [{ worldId: "dark_moon", count: 19 }],
    worldFirstActionRows: [{ worldId: "dark_moon", count: 8 }],
  });

  assert.equal(result.sampleSize, 19);
  assert.equal(result.evidenceSufficiency, "insufficient");
});

test("content quality snapshot aggregates validator issues by code", () => {
  const result = buildContentQualityMetricsSnapshot({
    validatorRows: [
      { byCode: { npc_scene_conflict: 2, chapter_order_conflict: 1 } },
      { issueCodes: ["npc_scene_conflict", "rule_leak"] },
      { issueCode: "rule_leak", issueCount: 3 },
    ],
  });

  assert.equal(result.validatorIssues.total, 8);
  assert.deepEqual(result.validatorIssues.byCode, [
    { code: "rule_leak", count: 4 },
    { code: "npc_scene_conflict", count: 3 },
    { code: "chapter_order_conflict", count: 1 },
  ]);
});
