import test from "node:test";
import assert from "node:assert/strict";
import {
  getVerseCraftRolloutMetricsSnapshot,
  recordSceneActorGateTelemetry,
  recordSceneActorGateValidatorOutcome,
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

test("records SceneActorGate aggregate telemetry without high-cardinality fields", () => {
  resetVerseCraftRolloutMetrics();

  recordSceneActorGateTelemetry({
    enabled: true,
    focusNpcId: null,
    multiPresentNoFocus: true,
    packetChars: 321,
    canSpeakCount: 3,
    forbiddenMentionCount: 1,
  });
  recordSceneActorGateValidatorOutcome({
    validatorTriggered: true,
    rewriteTriggered: true,
  });

  const snapshot = getVerseCraftRolloutMetricsSnapshot();
  assert.equal(snapshot.sceneActorGateEnabled, 1);
  assert.equal(snapshot.sceneActorGateFocusNull, 1);
  assert.equal(snapshot.sceneActorGateMultiPresentNoFocus, 1);
  assert.equal(snapshot.sceneActorGatePacketChars, 321);
  assert.equal(snapshot.sceneActorGatePacketSamples, 1);
  assert.equal(snapshot.sceneActorGateCanSpeakCount, 3);
  assert.equal(snapshot.sceneActorGateForbiddenMentionCount, 1);
  assert.equal(snapshot.sceneActorGateValidatorTriggered, 1);
  assert.equal(snapshot.sceneActorGateRewriteTriggered, 1);
  assert.equal("sceneActorGateFocusNpcId" in snapshot, false);
});
