import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeHomeSurveyAnswers,
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

test("normalizeHomeSurveyAnswers accepts valid v1.1 payload", () => {
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

