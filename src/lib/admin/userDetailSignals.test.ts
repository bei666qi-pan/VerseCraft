import test from "node:test";
import assert from "node:assert/strict";
import { buildAdminUserDetailSignals } from "@/lib/admin/userDetailSignals";

test("registered user detail signals identify journey stage", () => {
  const result = buildAdminUserDetailSignals({
    basic: { actorType: "registered", tokensUsed: 1000 },
    recentEvents: [
      { eventName: "first_effective_action" },
      { eventName: "enter_main_game" },
      { eventName: "character_create_success" },
      { eventName: "character_create_started" },
      { eventName: "world_selected" },
      { eventName: "home_viewed" },
    ],
  });

  assert.equal(result.journeyStage.currentStage, "first_effective_action");
  assert.equal(result.journeyStage.nextStage, "third_effective_action");
});

test("guest detail signals support guest without user id", () => {
  const result = buildAdminUserDetailSignals({
    basic: { actorType: "guest", tokensUsed: 80_000 },
    recentEvents: [{ eventName: "home_viewed" }],
    aiExperience: { tokenCost: 80_000 },
  });

  assert.equal(result.journeyStage.currentStage, "home_viewed");
  assert.ok(result.riskTags.includes("high_ai_cost"));
});

test("no-event detail stays structured", () => {
  const result = buildAdminUserDetailSignals({
    basic: { actorType: "guest" },
    recentEvents: [],
  });

  assert.equal(result.journeyStage.status, "no_events");
  assert.deepEqual(result.riskTags, []);
  assert.ok(result.suggestedOpsActions[0]?.includes("暂无行为样本"));
});

test("risk tags cover wait, stuck, negative survey, save anxiety, and content risk", () => {
  const result = buildAdminUserDetailSignals({
    recentEvents: [
      { eventName: "enter_main_game" },
      { eventName: "character_create_success" },
      { eventName: "character_create_started" },
      { eventName: "world_selected" },
      { eventName: "home_viewed" },
      { eventName: "npc_interaction_failed" },
    ],
    aiExperience: { avgLatency: 22_000, slowRequestCount: 1 },
    feedbackAndSurvey: {
      negativeFeedbackCount: 1,
      negativeSurveyCount: 1,
      saveAnxietyCount: 1,
    },
    contentPath: {
      chapters: [{ abandoned: 1 }],
      npcs: [{ failed: 1 }],
    },
  });

  for (const tag of [
    "wait_too_long",
    "stuck_before_first_action",
    "survey_negative",
    "feedback_negative",
    "save_anxiety",
    "content_quality_risk",
  ] as const) {
    assert.ok(result.riskTags.includes(tag), tag);
  }
});
