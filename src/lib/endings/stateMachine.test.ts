import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEndingIdempotencyKey,
  buildSettlementSnapshot,
  createInitialEndingState,
  evaluateEndingEligibility,
  transitionEndingState,
} from "./index";
import type { EndingEvaluationInput, EndingFinalChoice, EndingSettlementSnapshot, EndingState } from "./types";

const FINAL_CHOICE: EndingFinalChoice = {
  id: "embrace_doom",
  label: "迎接终焉",
  description: "确认本局终点。",
  outcome: "doom",
  selectedAt: "2026-05-08T00:00:00.000Z",
};

function baseInput(overrides: Partial<EndingEvaluationInput> = {}): EndingEvaluationInput {
  return {
    stats: { sanity: 30 },
    time: { day: 10, hour: 5 },
    playerLocation: "B2_Exit",
    historicalMaxFloorScore: 8,
    escapeMainline: { stage: "trapped" },
    logs: [
      { role: "user", content: "推开最后一扇门" },
      { role: "assistant", content: "门后没有清晨，只有终焉落下。" },
    ],
    turnCount: 30,
    ...overrides,
  };
}

function readyState(runId = "run_state"): {
  state: EndingState;
  snapshot: EndingSettlementSnapshot;
  idempotencyKey: string;
} {
  const input = baseInput();
  const eligibility = evaluateEndingEligibility(input);
  assert.ok(eligibility);
  const idempotencyKey = buildEndingIdempotencyKey({
    runId,
    outcome: eligibility.outcome,
    detectedAtTurn: eligibility.detectedAtTurn,
  });
  let state = transitionEndingState(createInitialEndingState(), {
    type: "TURN_COMMITTED",
    runId,
    eligibility,
  });
  state = transitionEndingState(state, {
    type: "FINAL_NARRATIVE_COMMITTED",
    narrative: "终焉落下，门不再回答。",
    at: "2026-05-08T00:00:00.000Z",
  });
  const snapshot = buildSettlementSnapshot({
    runId,
    eligibility,
    stats: input.stats,
    time: input.time,
    playerLocation: input.playerLocation,
    historicalMaxFloorScore: input.historicalMaxFloorScore,
    logs: input.logs,
    finalNarrative: state.finalNarrative,
    createdAt: "2026-05-08T00:00:01.000Z",
  });
  state = transitionEndingState(state, {
    type: "SETTLEMENT_SNAPSHOT_CREATED",
    snapshot,
    idempotencyKey,
  });
  return { state, snapshot, idempotencyKey };
}

test("TURN_COMMITTED moves playing state to eligible", () => {
  const input = baseInput({ escapeMainline: { stage: "escaped_true" } });
  const eligibility = evaluateEndingEligibility(input);
  assert.ok(eligibility);
  const state = transitionEndingState(createInitialEndingState(), {
    type: "TURN_COMMITTED",
    runId: "run_turn",
    eligibility,
  });
  assert.equal(state.phase, "eligible");
  assert.equal(state.eligibility?.outcome, "true_escape");
  assert.equal(state.idempotencyKey, "run_turn:true_escape:30");
});

test("final action and final narrative advance through pending phases", () => {
  const input = baseInput();
  const eligibility = evaluateEndingEligibility(input);
  assert.ok(eligibility);
  let state = transitionEndingState(createInitialEndingState(), {
    type: "TURN_COMMITTED",
    runId: "run_phase",
    eligibility,
  });
  state = transitionEndingState(state, {
    type: "FINAL_ACTION_SELECTED",
    choice: FINAL_CHOICE,
    at: "2026-05-08T00:00:00.000Z",
  });
  assert.equal(state.phase, "final_turn_pending");
  state = transitionEndingState(state, {
    type: "FINAL_NARRATIVE_COMMITTED",
    narrative: "最终叙事已经冻结。",
    at: "2026-05-08T00:00:01.000Z",
  });
  assert.equal(state.phase, "final_narrative_committing");
  assert.equal(state.finalNarrative, "最终叙事已经冻结。");
});

test("settlement_ready must have settlementSnapshot", () => {
  const input = baseInput();
  const eligibility = evaluateEndingEligibility(input);
  assert.ok(eligibility);
  let state = transitionEndingState(createInitialEndingState(), {
    type: "TURN_COMMITTED",
    runId: "run_snapshot",
    eligibility,
  });
  const unchanged = transitionEndingState(state, {
    type: "SETTLEMENT_SNAPSHOT_CREATED",
    snapshot: null,
  });
  assert.equal(unchanged.phase, "eligible");

  const snapshot = buildSettlementSnapshot({
    runId: "run_snapshot",
    eligibility,
    stats: input.stats,
    time: input.time,
    playerLocation: input.playerLocation,
    historicalMaxFloorScore: input.historicalMaxFloorScore,
    logs: input.logs,
  });
  state = transitionEndingState(state, {
    type: "SETTLEMENT_SNAPSHOT_CREATED",
    snapshot,
  });
  assert.equal(state.phase, "settlement_ready");
  assert.ok(state.settlementSnapshot);
});

test("settled state cannot return to playing unless reset", () => {
  const { state } = readyState("run_settled");
  const settled = transitionEndingState(state, {
    type: "SETTLED",
    at: "2026-05-08T00:00:02.000Z",
  });
  assert.equal(settled.phase, "settled");
  const afterTurn = transitionEndingState(settled, {
    type: "TURN_COMMITTED",
    runId: "run_settled",
    eligibility: null,
  });
  assert.equal(afterTurn.phase, "settled");
  const reset = transitionEndingState(afterTurn, { type: "RESET_FOR_NEW_RUN" });
  assert.equal(reset.phase, "playing");
  assert.equal(reset.settlementSnapshot, null);
});

test("same idempotencyKey does not create a duplicate settlementSnapshot", () => {
  const { state, snapshot, idempotencyKey } = readyState("run_idempotent");
  const duplicateSnapshot: EndingSettlementSnapshot = {
    ...snapshot,
    settlementId: "different_settlement_id",
    caption: "不应覆盖第一次冻结的快照",
  };
  const next = transitionEndingState(state, {
    type: "SETTLEMENT_SNAPSHOT_CREATED",
    snapshot: duplicateSnapshot,
    idempotencyKey,
  });
  assert.equal(next.settlementSnapshot, snapshot);
  assert.equal(next.settlementSnapshot?.settlementId, snapshot.settlementId);
});

test("redirect records timestamp only after settlement is ready", () => {
  const initial = createInitialEndingState();
  const ignored = transitionEndingState(initial, {
    type: "REDIRECTED_TO_SETTLEMENT",
    at: "2026-05-08T00:00:00.000Z",
  });
  assert.equal(ignored.redirectedAt, null);

  const { state } = readyState("run_redirect");
  const redirected = transitionEndingState(state, {
    type: "REDIRECTED_TO_SETTLEMENT",
    at: "2026-05-08T00:00:03.000Z",
  });
  assert.equal(redirected.phase, "settlement_ready");
  assert.equal(redirected.redirectedAt, "2026-05-08T00:00:03.000Z");
});
