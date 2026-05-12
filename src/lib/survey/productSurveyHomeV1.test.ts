import test from "node:test";
import assert from "node:assert/strict";
import {
  HOME_SURVEY_FLOW,
  normalizeHomeSurveyAnswers,
  summarizeHomeSurveyAnswers,
  DISCOVERY_SOURCE_OPTIONS,
  EXPERIENCE_STAGE_OPTIONS,
  CREATE_FRICTION_OPTIONS,
  IMMERSION_ISSUE_OPTIONS,
  CORE_FUN_POINT_OPTIONS,
  QUIT_REASON_OPTIONS,
  SAVE_LOSS_CONCERN_OPTIONS,
  RECOMMEND_WILLINGNESS_OPTIONS,
} from "./productSurveyHomeV1";

function pick<T extends { value: string }>(arr: T[]): string {
  return arr[0]?.value ?? "";
}

test("normalizeHomeSurveyAnswers accepts valid home survey payload", () => {
  const raw = {
    discoverySource: pick(DISCOVERY_SOURCE_OPTIONS),
    experienceStage: pick(EXPERIENCE_STAGE_OPTIONS),
    createFriction: pick(CREATE_FRICTION_OPTIONS),
    immersionIssue: pick(IMMERSION_ISSUE_OPTIONS),
    coreFunPoint: pick(CORE_FUN_POINT_OPTIONS),
    quitReason: pick(QUIT_REASON_OPTIONS),
    topFixOne: "先把新手引导做得更清楚",
    saveLossConcern: pick(SAVE_LOSS_CONCERN_OPTIONS),
    recommendWillingness: pick(RECOMMEND_WILLINGNESS_OPTIONS),
    finalSuggestion: "整体氛围很棒，但希望更连贯。",
  };
  const out = normalizeHomeSurveyAnswers(raw);
  assert.ok(out);
  assert.equal(out.discoverySource, raw.discoverySource);
});

test("summarizeHomeSurveyAnswers returns every question with labels and redacted text", () => {
  const summary = summarizeHomeSurveyAnswers({
    discoverySource: "friend",
    experienceStage: "first_time",
    createFriction: "overall_ok",
    immersionIssue: "reply_wait_too_long",
    coreFunPoint: "ai_narrative_presence",
    quitReason: "wait_too_long",
    topFixOne: "请联系 13812345678 或 user@example.com",
    saveLossConcern: "not_worried_at_all",
    recommendWillingness: "very_willing",
    finalSuggestion: "",
  });

  assert.equal(summary.length, HOME_SURVEY_FLOW.length);
  assert.equal(summary.find((x) => x.questionId === "discoverySource")?.label, "朋友推荐");
  assert.equal(summary.find((x) => x.questionId === "finalSuggestion")?.filled, false);
  const topFix = summary.find((x) => x.questionId === "topFixOne")?.label ?? "";
  assert.ok(topFix.includes("[phone]"));
  assert.ok(topFix.includes("[email]"));
});

test("normalizeHomeSurveyAnswers rejects missing required fields", () => {
  const out = normalizeHomeSurveyAnswers({ discoverySource: "friend" });
  assert.equal(out, null);
});

test("normalizeHomeSurveyAnswers rejects unknown option values", () => {
  const raw = {
    discoverySource: "not-a-real-option",
    experienceStage: pick(EXPERIENCE_STAGE_OPTIONS),
    createFriction: pick(CREATE_FRICTION_OPTIONS),
    immersionIssue: pick(IMMERSION_ISSUE_OPTIONS),
    coreFunPoint: pick(CORE_FUN_POINT_OPTIONS),
    quitReason: pick(QUIT_REASON_OPTIONS),
    topFixOne: "先把新手引导做得更清楚",
    saveLossConcern: pick(SAVE_LOSS_CONCERN_OPTIONS),
    recommendWillingness: pick(RECOMMEND_WILLINGNESS_OPTIONS),
    finalSuggestion: "整体氛围很棒，但希望更连贯。",
  };
  const out = normalizeHomeSurveyAnswers(raw);
  assert.equal(out, null);
});

