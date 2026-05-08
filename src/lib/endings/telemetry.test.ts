import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEndingTelemetryIdempotencyKey,
  buildEndingTelemetryPayload,
} from "@/lib/endings/telemetry";
import type { EndingState } from "@/lib/endings/types";

test("buildEndingTelemetryPayload includes required ending fields", () => {
  const state: EndingState = {
    phase: "eligible",
    eligibility: {
      outcome: "true_escape",
      confidence: 1,
      reasons: ["escape_stage_escaped_true"],
      blockers: [],
      detectedAtTurn: 12,
      source: "escape_mainline",
      priority: 90,
    },
    finalChoice: null,
    deathContext: null,
    finalNarrative: null,
    settlementSnapshot: null,
    redirectedAt: null,
    settledAt: null,
    idempotencyKey: "run-1:true_escape:12",
  };

  const payload = buildEndingTelemetryPayload({
    endingState: state,
    runId: "run-1",
    escapeStage: "escaped_true",
    time: { day: 10, hour: 5 },
    source: "post_turn_evaluation",
  });

  assert.equal(payload.runId, "run-1");
  assert.equal(payload.outcome, "true_escape");
  assert.equal(payload.endingPhase, "eligible");
  assert.equal(payload.detectedAtTurn, 12);
  assert.equal(payload.idempotencyKey, "run-1:true_escape:12");
  assert.deepEqual(payload.reasons, ["escape_stage_escaped_true"]);
  assert.deepEqual(payload.blockers, []);
  assert.equal(payload.escapeStage, "escaped_true");
  assert.equal(payload.survivalHours, 245);
  assert.equal(payload.source, "post_turn_evaluation");
});

test("buildEndingTelemetryPayload can represent blocked playing state without a snapshot", () => {
  const payload = buildEndingTelemetryPayload({
    runId: "run-2",
    escapeStage: "seeking",
    time: { day: 2, hour: 3 },
    source: "post_turn_evaluation",
    extra: {
      outcome: null,
      blockers: ["no_ending_conditions_met"],
    },
  });

  assert.equal(payload.outcome, null);
  assert.equal(payload.endingPhase, "playing");
  assert.deepEqual(payload.blockers, ["no_ending_conditions_met"]);
  assert.equal(payload.snapshotPresent, false);
  assert.equal(payload.survivalHours, 51);
});

test("buildEndingTelemetryIdempotencyKey is stable for same ending event", () => {
  const payload = buildEndingTelemetryPayload({
    runId: "run-3",
    escapeStage: "escaped_false",
    time: { day: 4, hour: 0 },
    source: "settlement",
    extra: {
      outcome: "false_escape",
      endingPhase: "settlement_ready",
      detectedAtTurn: 7,
      idempotencyKey: "run-3:false_escape:7",
    },
  });

  assert.equal(
    buildEndingTelemetryIdempotencyKey("ending_settlement_viewed", payload, "page"),
    buildEndingTelemetryIdempotencyKey("ending_settlement_viewed", payload, "page")
  );
});
