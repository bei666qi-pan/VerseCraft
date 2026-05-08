import test from "node:test";
import assert from "node:assert/strict";
import { buildSurveyAggregateReport } from "@/lib/admin/surveyAggregate";
import type { AdminTimeRange } from "@/lib/admin/timeRange";

const range: AdminTimeRange = {
  preset: "7d",
  label: "最近7天",
  startDateKey: "2026-05-01",
  endDateKey: "2026-05-07",
  start: new Date("2026-05-01T00:00:00.000Z"),
  end: new Date("2026-05-07T23:59:59.999Z"),
};

test("survey aggregate computes option distribution", () => {
  const report = buildSurveyAggregateReport(
    range,
    [
      {
        guestId: "g1",
        answers: {
          discoverySource: "friend",
          experienceStage: "first_time",
          createFriction: "overall_ok",
          immersionIssue: "reply_wait_too_long",
          coreFunPoint: "ai_narrative_presence",
          quitReason: "wait_too_long",
          topFixOne: "等待太久",
          saveLossConcern: "slightly_worried_acceptable",
          recommendWillingness: "depends",
        },
      },
      {
        userId: "u1",
        answers: {
          discoverySource: "friend",
          experienceStage: "multi_time",
          createFriction: "talent_selection",
          immersionIssue: "too_many_rules",
          coreFunPoint: "npc_interaction",
          quitReason: "hard_to_understand",
          topFixOne: "看不懂规则",
          saveLossConcern: "not_worried_at_all",
          recommendWillingness: "very_willing",
        },
      },
    ],
    []
  );

  const discovery = report.questions.find((q) => q.id === "discoverySource");
  assert.equal(report.totalResponses, 2);
  assert.equal(discovery?.sampleCount, 2);
  assert.equal(discovery?.options?.[0]?.value, "friend");
  assert.equal(discovery?.options?.[0]?.count, 2);
});

test("survey aggregate computes completion funnel and per-question dropoff", () => {
  const report = buildSurveyAggregateReport(
    range,
    [],
    [
      { eventName: "survey_entry_exposed", actorKey: "g:a", payload: {} },
      { eventName: "survey_entry_exposed", actorKey: "g:b", payload: {} },
      { eventName: "survey_entry_clicked", actorKey: "g:a", payload: {} },
      { eventName: "survey_modal_opened", actorKey: "g:a", payload: {} },
      { eventName: "survey_started", actorKey: "g:a", payload: {} },
      { eventName: "survey_step_viewed", actorKey: "g:a", payload: { stepIndex: 0 } },
      { eventName: "survey_step_viewed", actorKey: "g:a", payload: { stepIndex: 1 } },
      { eventName: "survey_step_viewed", actorKey: "g:b", payload: { stepIndex: 0 } },
      { eventName: "survey_submit_attempted", actorKey: "g:a", payload: {} },
      { eventName: "survey_submitted", actorKey: "g:a", payload: {} },
    ]
  );

  assert.equal(report.completionFunnel[0]?.count, 2);
  assert.equal(report.completionFunnel[1]?.count, 1);
  assert.equal(report.completionFunnel[1]?.stepConversionRate, 0.5);
  assert.equal(report.perQuestionDropoff[0]?.viewed, 2);
  assert.equal(report.perQuestionDropoff[0]?.dropOffCount, 1);
});

test("survey aggregate classifies open text themes with local fallback", () => {
  const report = buildSurveyAggregateReport(
    range,
    [
      { guestId: "g1", answers: { topFixOne: "等待回复太久，希望快一点", finalSuggestion: "" } },
      { guestId: "g2", answers: { topFixOne: "我看不懂规则，也不知道下一步", finalSuggestion: "" } },
      { guestId: "g3", answers: { topFixOne: "担心存档丢失", finalSuggestion: "" } },
    ],
    []
  );

  assert.equal(report.textThemes.find((x) => x.theme === "等待太久")?.count, 1);
  assert.equal(report.textThemes.find((x) => x.theme === "看不懂规则")?.count, 1);
  assert.equal(report.textThemes.find((x) => x.theme === "存档担忧")?.count, 1);
});

test("survey aggregate marks insufficient sample and truncates low rating samples", () => {
  const report = buildSurveyAggregateReport(
    range,
    [
      {
        guestId: "g1",
        overallRating: 1,
        recommendScore: 2,
        createdAt: "2026-05-02T00:00:00.000Z",
        answers: {
          experienceStage: "first_time",
          topFixOne: `文本不稳定 ${"太长".repeat(100)} 13812345678 user@example.com`,
        },
      },
    ],
    []
  );

  assert.equal(report.evidenceSufficiency, "insufficient");
  assert.equal(report.lowRatingSamples.length, 1);
  assert.ok(report.lowRatingSamples[0]!.summary.length <= 120);
  assert.ok(!report.lowRatingSamples[0]!.summary.includes("13812345678"));
  assert.ok(!report.lowRatingSamples[0]!.summary.includes("user@example.com"));
});
