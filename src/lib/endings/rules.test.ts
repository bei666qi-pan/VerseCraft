import assert from "node:assert/strict";
import test from "node:test";
import { buildEndingIdempotencyKey, evaluateEndingEligibility } from "./rules";
import type { EndingEvaluationInput } from "./types";

function baseInput(overrides: Partial<EndingEvaluationInput> = {}): EndingEvaluationInput {
  return {
    stats: { sanity: 30 },
    time: { day: 2, hour: 3 },
    playerLocation: "B1_SafeZone",
    historicalMaxFloorScore: 0,
    escapeMainline: { stage: "trapped" },
    logs: [],
    turnCount: 12,
    ...overrides,
  };
}

test("death has highest priority over escape and doom", () => {
  const eligibility = evaluateEndingEligibility(
    baseInput({
      stats: { sanity: 0 },
      time: { day: 10, hour: 5 },
      escapeMainline: { stage: "escaped_true" },
    })
  );
  assert.equal(eligibility?.outcome, "death");
  assert.equal(eligibility?.priority, 100);
});

test("resolved turn death is treated as death even when sanity remains", () => {
  const eligibility = evaluateEndingEligibility(
    baseInput({
      stats: { sanity: 30 },
      resolvedTurn: { is_death: true },
    })
  );
  assert.equal(eligibility?.outcome, "death");
  assert.equal(eligibility?.source, "resolved_turn");
});

test("escaped_true is not overwritten by doom", () => {
  const eligibility = evaluateEndingEligibility(
    baseInput({
      time: { day: 10, hour: 5 },
      escapeMainline: { stage: "escaped_true" },
    })
  );
  assert.equal(eligibility?.outcome, "true_escape");
});

test("escaped_costly is not overwritten by doom", () => {
  const eligibility = evaluateEndingEligibility(
    baseInput({
      time: { day: 10, hour: 5 },
      escapeMainline: { stage: "escaped_costly" },
    })
  );
  assert.equal(eligibility?.outcome, "costly_escape");
});

test("escaped_false is not overwritten by doom", () => {
  const eligibility = evaluateEndingEligibility(
    baseInput({
      time: { day: 10, hour: 5 },
      escapeMainline: { stage: "escaped_false" },
    })
  );
  assert.equal(eligibility?.outcome, "false_escape");
});

test("survivalHours >= 240 triggers doom", () => {
  const eligibility = evaluateEndingEligibility(baseInput({ time: { day: 9, hour: 24 } }));
  assert.equal(eligibility?.outcome, "doom");
  assert.deepEqual(eligibility?.reasons, ["survival_hours_gte_240"]);
});

test("day 10 hour 5 triggers doom without requiring day 10 hour 0", () => {
  const eligibility = evaluateEndingEligibility(baseInput({ time: { day: 10, hour: 5 } }));
  assert.equal(eligibility?.outcome, "doom");
});

test("abandon is eligible when no stronger ending exists", () => {
  const eligibility = evaluateEndingEligibility(baseInput({ abandonRequested: true }));
  assert.equal(eligibility?.outcome, "abandon");
  assert.equal(eligibility?.source, "manual");
});

test("buildEndingIdempotencyKey uses run id, outcome, and detected turn", () => {
  assert.equal(
    buildEndingIdempotencyKey({ runId: "run_a", outcome: "doom", detectedAtTurn: 42 }),
    "run_a:doom:42"
  );
});
