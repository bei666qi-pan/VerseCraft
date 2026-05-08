import { buildEndingIdempotencyKey } from "./rules";
import type { EndingState, EndingStateMachineEvent } from "./types";

export function createInitialEndingState(): EndingState {
  return {
    phase: "playing",
    eligibility: null,
    finalChoice: null,
    deathContext: null,
    finalNarrative: null,
    settlementSnapshot: null,
    redirectedAt: null,
    settledAt: null,
    idempotencyKey: null,
  };
}

function isTerminal(state: EndingState): boolean {
  return state.phase === "settled";
}

function normalizeTransitionState(prev: EndingState | null | undefined): EndingState {
  const state = prev ?? createInitialEndingState();
  if (state.phase === "settlement_ready" && !state.settlementSnapshot) {
    return {
      ...state,
      phase: state.eligibility ? "eligible" : "playing",
      redirectedAt: null,
    };
  }
  return state;
}

export function transitionEndingState(
  prev: EndingState | null | undefined,
  event: EndingStateMachineEvent
): EndingState {
  const state = normalizeTransitionState(prev);
  if (event.type === "RESET_FOR_NEW_RUN") return createInitialEndingState();
  if (isTerminal(state)) return state;

  switch (event.type) {
    case "TURN_COMMITTED": {
      if (!event.eligibility) return state;
      if (state.idempotencyKey && state.eligibility) return state;
      return {
        ...state,
        phase: "eligible",
        eligibility: event.eligibility,
        deathContext: event.deathContext ?? state.deathContext ?? null,
        idempotencyKey: buildEndingIdempotencyKey({
          runId: event.runId,
          outcome: event.eligibility.outcome,
          detectedAtTurn: event.eligibility.detectedAtTurn,
        }),
      };
    }
    case "FINAL_ACTION_SELECTED": {
      if (!state.eligibility) return state;
      if (state.phase !== "eligible") return state;
      return { ...state, phase: "final_turn_pending", finalChoice: event.choice };
    }
    case "FINAL_NARRATIVE_COMMITTED": {
      if (!state.eligibility) return state;
      if (state.phase === "settlement_ready") return state;
      return {
        ...state,
        phase: "final_narrative_committing",
        finalNarrative: String(event.narrative ?? ""),
      };
    }
    case "SETTLEMENT_SNAPSHOT_CREATED": {
      if (!event.snapshot) return state;
      const incomingKey = event.idempotencyKey ?? state.idempotencyKey;
      if (state.settlementSnapshot && incomingKey && incomingKey === state.idempotencyKey) return state;
      if (!state.eligibility) return state;
      return {
        ...state,
        phase: "settlement_ready",
        settlementSnapshot: event.snapshot,
        finalNarrative: state.finalNarrative ?? event.snapshot.finalNarrative,
        idempotencyKey: incomingKey ?? state.idempotencyKey,
      };
    }
    case "REDIRECTED_TO_SETTLEMENT": {
      if (state.phase !== "settlement_ready" || !state.settlementSnapshot) return state;
      return {
        ...state,
        redirectedAt: state.redirectedAt ?? event.at,
      };
    }
    case "SETTLED": {
      if (state.phase !== "settlement_ready" || !state.settlementSnapshot) return state;
      return {
        ...state,
        phase: "settled",
        settledAt: state.settledAt ?? event.at,
      };
    }
    default:
      return state;
  }
}
