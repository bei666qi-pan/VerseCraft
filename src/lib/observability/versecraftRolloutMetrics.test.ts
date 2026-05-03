import test from "node:test";
import assert from "node:assert/strict";
import {
  getVerseCraftRolloutMetricsSnapshot,
  recordNarrativeChars,
  resetVerseCraftRolloutMetrics,
} from "@/lib/observability/versecraftRolloutMetrics";

test("recordNarrativeChars keeps legacy char samples and records length telemetry counters", () => {
  resetVerseCraftRolloutMetrics();

  recordNarrativeChars(120);
  recordNarrativeChars(80, {
    underMin: true,
    overMax: true,
    severity: "medium",
    budgetMissing: true,
    assessmentError: true,
  });

  const snapshot = getVerseCraftRolloutMetricsSnapshot();
  assert.equal(snapshot.narrativeCharsSum, 200);
  assert.equal(snapshot.narrativeCharsSamples, 2);
  assert.equal(snapshot.narrativeUnderMinCount, 1);
  assert.equal(snapshot.narrativeOverMaxCount, 1);
  assert.equal(snapshot.narrativeLengthMediumSeverityCount, 1);
  assert.equal(snapshot.narrativeLengthBudgetMissingCount, 1);
  assert.equal(snapshot.narrativeLengthAssessmentErrorCount, 1);
});
