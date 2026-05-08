import assert from "node:assert/strict";
import test from "node:test";
import fc from "fast-check";
import {
  ENDING_OUTCOME_PRIORITY,
  buildEndingIdempotencyKey,
  buildSettlementSnapshot,
  createInitialEndingState,
  evaluateEndingEligibility,
  transitionEndingState,
} from "./index";
import type {
  EndingEligibility,
  EndingEvaluationInput,
  EndingFinalChoice,
  EndingOutcome,
  EndingPhase,
  EndingSettlementSnapshot,
  EndingState,
  EndingStateMachineEvent,
} from "./types";

const OUTCOMES = ["death", "doom", "true_escape", "costly_escape", "false_escape", "abandon"] as const;
const PHASES = [
  "playing",
  "eligible",
  "final_turn_pending",
  "final_narrative_committing",
  "settlement_ready",
  "settled",
] as const;
const ESCAPED_STAGE_TO_OUTCOME = {
  escaped_true: "true_escape",
  escaped_costly: "costly_escape",
  escaped_false: "false_escape",
} as const;

const runIdArb = fc.string({ minLength: 0, maxLength: 24 });
const shortTextArb = fc.string({ minLength: 0, maxLength: 80 });
const isoTextArb = fc.string({ minLength: 0, maxLength: 40 });
const turnArb = fc.integer({ min: 0, max: 10_000 });
const outcomeArb = fc.constantFrom<EndingOutcome>(...OUTCOMES);
const phaseArb = fc.constantFrom<EndingPhase>(...PHASES);
const escapedStageArb = fc.constantFrom("escaped_true", "escaped_costly", "escaped_false");
const nonEscapedStageArb = fc.constantFrom(
  "",
  "trapped",
  "aware_exit_exists",
  "route_fragmented",
  "conditions_known",
  "conditions_partially_met",
  "final_window_open",
  "doomed",
  "unknown"
);

function eligibilityFor(outcome: EndingOutcome, detectedAtTurn: number): EndingEligibility {
  return {
    outcome,
    confidence: 1,
    reasons: [`property:${outcome}`],
    blockers: [],
    detectedAtTurn,
    source: outcome === "death" ? "player_stats" : outcome === "doom" ? "time" : "escape_mainline",
    priority: ENDING_OUTCOME_PRIORITY[outcome],
  };
}

function evaluationInput(overrides: Partial<EndingEvaluationInput> = {}): EndingEvaluationInput {
  return {
    stats: { sanity: 30 },
    time: { day: 1, hour: 1 },
    playerLocation: "B1_SafeZone",
    historicalMaxFloorScore: 0,
    escapeMainline: { stage: "trapped" },
    logs: [],
    turnCount: 0,
    ...overrides,
  };
}

const eligibilityArb: fc.Arbitrary<EndingEligibility> = fc
  .record({
    outcome: outcomeArb,
    detectedAtTurn: turnArb,
    confidence: fc.float({ min: 0, max: 1, noNaN: true }),
    reasons: fc.array(shortTextArb, { maxLength: 4 }),
    blockers: fc.array(shortTextArb, { maxLength: 4 }),
  })
  .map((value) => ({
    outcome: value.outcome,
    confidence: value.confidence,
    reasons: value.reasons,
    blockers: value.blockers,
    detectedAtTurn: value.detectedAtTurn,
    source: value.outcome === "death" ? "player_stats" : value.outcome === "doom" ? "time" : "escape_mainline",
    priority: ENDING_OUTCOME_PRIORITY[value.outcome],
  }));

const finalChoiceArb: fc.Arbitrary<EndingFinalChoice> = fc
  .record({
    label: shortTextArb,
    description: shortTextArb,
    outcome: outcomeArb,
    selectedAt: isoTextArb,
  })
  .map((value) => ({
    id: "embrace_doom",
    label: value.label,
    description: value.description,
    outcome: value.outcome,
    selectedAt: value.selectedAt,
  }));

const deathContextArb = fc.oneof(
  fc.constant(null),
  fc.record({
    deathCause: fc.oneof(fc.constant(null), shortTextArb),
    deathLocation: fc.oneof(fc.constant(null), shortTextArb),
    lastAction: fc.oneof(fc.constant(null), shortTextArb),
  })
);

const snapshotArb: fc.Arbitrary<EndingSettlementSnapshot> = fc
  .record({
    runId: runIdArb,
    outcome: outcomeArb,
    turn: turnArb,
    createdAt: isoTextArb,
  })
  .map(({ runId, outcome, turn, createdAt }) => ({
    v: 1,
    runId,
    settlementId: `settlement:${runId}:${outcome}:${turn}`,
    outcome,
    grade: "B",
    title: `title:${outcome}`,
    caption: `caption:${outcome}`,
    finalNarrative: "final narrative",
    survivalHours: 24,
    survivalDay: 1,
    survivalHour: 0,
    maxFloorScore: 1,
    maxFloorLabel: "1F",
    killedAnomalies: 0,
    keyChoices: [],
    obtainedClues: [],
    npcEpilogues: [],
    worldStateLines: [],
    createdAt,
    writingMarkdown: "# run",
  }));

const endingStateArb: fc.Arbitrary<EndingState> = fc.record({
  phase: phaseArb,
  eligibility: fc.oneof(fc.constant(null), eligibilityArb),
  finalChoice: fc.oneof(fc.constant(null), finalChoiceArb),
  deathContext: deathContextArb,
  finalNarrative: fc.oneof(fc.constant(null), shortTextArb),
  settlementSnapshot: fc.oneof(fc.constant(null), snapshotArb),
  redirectedAt: fc.oneof(fc.constant(null), isoTextArb),
  settledAt: fc.oneof(fc.constant(null), isoTextArb),
  idempotencyKey: fc.oneof(fc.constant(null), shortTextArb),
});

const eventArb: fc.Arbitrary<EndingStateMachineEvent> = fc.oneof(
  fc
    .record({
      runId: runIdArb,
      eligibility: fc.oneof(fc.constant(null), eligibilityArb),
      deathContext: deathContextArb,
    })
    .map((value) => ({ type: "TURN_COMMITTED", ...value }) as EndingStateMachineEvent),
  fc
    .record({ choice: finalChoiceArb, at: isoTextArb })
    .map((value) => ({ type: "FINAL_ACTION_SELECTED", ...value }) as EndingStateMachineEvent),
  fc
    .record({ narrative: shortTextArb, at: isoTextArb })
    .map((value) => ({ type: "FINAL_NARRATIVE_COMMITTED", ...value }) as EndingStateMachineEvent),
  fc
    .record({
      snapshot: fc.oneof(fc.constant(null), snapshotArb),
      idempotencyKey: fc.oneof(fc.constant(null), shortTextArb),
    })
    .map((value) => ({ type: "SETTLEMENT_SNAPSHOT_CREATED", ...value }) as EndingStateMachineEvent),
  fc.record({ at: isoTextArb }).map((value) => ({ type: "REDIRECTED_TO_SETTLEMENT", ...value }) as EndingStateMachineEvent),
  fc.record({ at: isoTextArb }).map((value) => ({ type: "SETTLED", ...value }) as EndingStateMachineEvent),
  fc.constant({ type: "RESET_FOR_NEW_RUN" } as EndingStateMachineEvent)
);

test("property: death has the highest priority", () => {
  fc.assert(
    fc.property(
      fc.record({
        sanity: fc.integer({ min: -10_000, max: 200 }),
        isDeath: fc.boolean(),
        day: fc.integer({ min: 0, max: 30 }),
        hour: fc.integer({ min: 0, max: 72 }),
        escapeStage: fc.string({ minLength: 0, maxLength: 32 }),
        turnCount: turnArb,
      }).filter((value) => value.sanity <= 0 || value.isDeath),
      (value) => {
        const eligibility = evaluateEndingEligibility(
          evaluationInput({
            stats: { sanity: value.sanity },
            time: { day: value.day, hour: value.hour },
            escapeMainline: { stage: value.escapeStage },
            resolvedTurn: { is_death: value.isDeath },
            turnCount: value.turnCount,
          })
        );
        assert.equal(eligibility?.outcome, "death", JSON.stringify(value));
      }
    ),
    { numRuns: 250, verbose: true }
  );
});

test("property: escaped stages are not overwritten by doom", () => {
  fc.assert(
    fc.property(
      fc.record({
        stage: escapedStageArb,
        day: fc.integer({ min: 0, max: 100 }),
        hour: fc.integer({ min: 0, max: 240 }),
        turnCount: turnArb,
      }),
      (value) => {
        const eligibility = evaluateEndingEligibility(
          evaluationInput({
            stats: { sanity: 1 },
            time: { day: value.day, hour: value.hour },
            escapeMainline: { stage: value.stage },
            turnCount: value.turnCount,
          })
        );
        assert.equal(eligibility?.outcome, ESCAPED_STAGE_TO_OUTCOME[value.stage], JSON.stringify(value));
      }
    ),
    { numRuns: 250, verbose: true }
  );
});

test("property: settled state cannot be moved back to playing by TURN_COMMITTED", () => {
  fc.assert(
    fc.property(
      endingStateArb.map((state) => ({ ...state, phase: "settled" as const })),
      fc.oneof(fc.constant(null), eligibilityArb),
      runIdArb,
      (state, eligibility, runId) => {
        const next = transitionEndingState(state, {
          type: "TURN_COMMITTED",
          runId,
          eligibility,
        });
        assert.equal(next.phase, "settled", JSON.stringify({ state, eligibility, runId }));
      }
    ),
    { numRuns: 250, verbose: true }
  );
});

test("property: settlement_ready always has a settlementSnapshot after transitions", () => {
  fc.assert(
    fc.property(endingStateArb, eventArb, (state, event) => {
      const next = transitionEndingState(state, event);
      if (next.phase === "settlement_ready") {
        assert.ok(next.settlementSnapshot, JSON.stringify({ state, event, next }));
      }
    }),
    { numRuns: 500, verbose: true }
  );
});

test("property: same runId, outcome and detected turn keep one settlement branch", () => {
  fc.assert(
    fc.property(
      fc.record({
        runId: runIdArb,
        outcome: outcomeArb,
        detectedAtTurn: turnArb,
        day: fc.integer({ min: 0, max: 12 }),
        hour: fc.integer({ min: 0, max: 36 }),
        maxFloor: fc.integer({ min: 0, max: 99 }),
      }),
      (value) => {
        const eligibility = eligibilityFor(value.outcome, value.detectedAtTurn);
        const idempotencyKey = buildEndingIdempotencyKey({
          runId: value.runId,
          outcome: value.outcome,
          detectedAtTurn: value.detectedAtTurn,
        });
        const snapshotA = buildSettlementSnapshot({
          runId: value.runId,
          eligibility,
          stats: { sanity: value.outcome === "death" ? 0 : 30 },
          time: { day: value.day, hour: value.hour },
          playerLocation: "B1_SafeZone",
          historicalMaxFloorScore: value.maxFloor,
          logs: [{ role: "assistant", content: "final" }],
          createdAt: "2026-05-08T00:00:00.000Z",
        });
        const snapshotB = buildSettlementSnapshot({
          runId: value.runId,
          eligibility,
          stats: { sanity: value.outcome === "death" ? 0 : 30 },
          time: { day: value.day, hour: value.hour },
          playerLocation: "B1_SafeZone",
          historicalMaxFloorScore: value.maxFloor,
          logs: [{ role: "assistant", content: "final changed" }],
          createdAt: "2026-05-08T00:00:01.000Z",
        });
        assert.equal(snapshotA.settlementId, snapshotB.settlementId, JSON.stringify(value));

        let state = transitionEndingState(createInitialEndingState(), {
          type: "TURN_COMMITTED",
          runId: value.runId,
          eligibility,
        });
        state = transitionEndingState(state, {
          type: "SETTLEMENT_SNAPSHOT_CREATED",
          snapshot: snapshotA,
          idempotencyKey,
        });
        const next = transitionEndingState(state, {
          type: "SETTLEMENT_SNAPSHOT_CREATED",
          snapshot: snapshotB,
          idempotencyKey,
        });
        assert.equal(next.settlementSnapshot?.settlementId, snapshotA.settlementId, JSON.stringify(value));
        assert.equal(next.settlementSnapshot?.createdAt, snapshotA.createdAt, JSON.stringify(value));
      }
    ),
    { numRuns: 250, verbose: true }
  );
});

test("property: ordinary playing inputs without ending conditions do not trigger endings", () => {
  fc.assert(
    fc.property(
      fc.record({
        sanity: fc.integer({ min: 1, max: 10_000 }),
        day: fc.integer({ min: 0, max: 9 }),
        hour: fc.integer({ min: 0, max: 23 }),
        escapeStage: nonEscapedStageArb,
        turnCount: turnArb,
      }),
      (value) => {
        const eligibility = evaluateEndingEligibility(
          evaluationInput({
            stats: { sanity: value.sanity },
            time: { day: value.day, hour: value.hour },
            escapeMainline: { stage: value.escapeStage },
            resolvedTurn: { is_death: false },
            abandonRequested: false,
            turnCount: value.turnCount,
          })
        );
        assert.equal(eligibility, null, JSON.stringify(value));
      }
    ),
    { numRuns: 250, verbose: true }
  );
});
