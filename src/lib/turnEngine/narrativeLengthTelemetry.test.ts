import test from "node:test";
import assert from "node:assert/strict";
import type { NarrativeBudget } from "@/lib/playRealtime/narrativeBudgetPackets";
import { assessNarrativeLength } from "@/lib/turnEngine/narrativeLength";
import {
  assessNarrativeLengthForTelemetry,
  buildNarrativeLengthTelemetry,
} from "@/lib/turnEngine/narrativeLengthTelemetry";

const standardBudget: NarrativeBudget = {
  schema: "narrative_budget_v1",
  tier: "standard",
  minChars: 260,
  targetChars: 420,
  maxChars: 520,
  minInfoBeats: 4,
  mustInclude: [],
  stopRule: "stop",
  reasonCodes: ["explore", "normal_risk"],
};

test("buildNarrativeLengthTelemetry maps assessment into analytics fields", () => {
  const assessment = assessNarrativeLength({
    narrative: "short",
    budget: standardBudget,
  });

  const telemetry = buildNarrativeLengthTelemetry({
    budget: standardBudget,
    assessment,
    playerChatMaxTokens: 1536,
  });

  assert.equal(telemetry.narrativeBudgetTier, "standard");
  assert.deepEqual(telemetry.narrativeBudgetReasonCodes, ["explore", "normal_risk"]);
  assert.equal(telemetry.narrativeMinChars, 260);
  assert.equal(telemetry.narrativeTargetChars, 420);
  assert.equal(telemetry.narrativeMaxChars, 520);
  assert.equal(telemetry.actualNarrativeChars, 5);
  assert.equal(telemetry.narrativeUnderMin, true);
  assert.equal(telemetry.narrativeOverMax, false);
  assert.equal(telemetry.narrativeLengthStatus, "ok");
  assert.equal(telemetry.playerChatMaxTokens, 1536);
  assert.equal(telemetry.narrativeLengthIssueCodes.includes("under_min"), true);
});

test("buildNarrativeLengthTelemetry marks budget_missing without throwing", () => {
  const telemetry = buildNarrativeLengthTelemetry({
    budget: null,
    actualNarrativeChars: 42,
    playerChatMaxTokens: 896,
  });

  assert.equal(telemetry.narrativeLengthStatus, "budget_missing");
  assert.equal(telemetry.narrativeBudgetTier, null);
  assert.equal(telemetry.actualNarrativeChars, 42);
  assert.deepEqual(telemetry.narrativeLengthIssueCodes, ["budget_missing"]);
});

test("buildNarrativeLengthTelemetry marks assessment_error without changing budget fields", () => {
  const telemetry = buildNarrativeLengthTelemetry({
    budget: standardBudget,
    actualNarrativeChars: 88,
    playerChatMaxTokens: 1536,
    status: "assessment_error",
  });

  assert.equal(telemetry.narrativeLengthStatus, "assessment_error");
  assert.equal(telemetry.narrativeLengthSeverity, "error");
  assert.equal(telemetry.narrativeBudgetTier, "standard");
  assert.equal(telemetry.actualNarrativeChars, 88);
  assert.deepEqual(telemetry.narrativeLengthIssueCodes, ["assessment_error"]);
});

test("assessNarrativeLengthForTelemetry catches assessor failures", () => {
  const result = assessNarrativeLengthForTelemetry({
    narrative: "will not throw outward",
    budget: standardBudget,
    playerChatMaxTokens: 1536,
    assess: () => {
      throw new Error("boom");
    },
  });

  assert.equal(result.telemetry.narrativeLengthStatus, "assessment_error");
  assert.equal(result.telemetry.narrativeLengthSeverity, "error");
  assert.equal(result.assessmentError instanceof Error, true);
  assert.equal(result.telemetry.actualNarrativeChars, "willnotthrowoutward".length);
});

test("assessNarrativeLengthForTelemetry marks missing budget", () => {
  const result = assessNarrativeLengthForTelemetry({
    narrative: "budget missing",
    budget: null,
    playerChatMaxTokens: 896,
  });

  assert.equal(result.telemetry.narrativeLengthStatus, "budget_missing");
  assert.equal(result.assessmentError, null);
  assert.deepEqual(result.telemetry.narrativeLengthIssueCodes, ["budget_missing"]);
});
