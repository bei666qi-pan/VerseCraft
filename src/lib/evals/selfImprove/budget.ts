/**
 * Self-Improving Agent System — Budget Tracker
 *
 * Tracks live model calls, wall-clock time, and round usage
 * against the configured budget. Provides checkpoints for
 * the orchestrator to decide whether to continue or stop.
 */

import type { SelfImproveBudget, StopReason } from "./types";
import { getState, trackLiveCall } from "./stateMachine";

// ── Budget tracking ───────────────────────────────────

let budgetStartTime: number = Date.now();

export function resetBudgetTimer(): void {
  budgetStartTime = Date.now();
}

export function elapsedMinutes(): number {
  return (Date.now() - budgetStartTime) / 60_000;
}

export interface BudgetStatus {
  roundsUsed: number;
  roundsLimit: number;
  roundsExhausted: boolean;
  liveCallsUsed: number;
  liveCallsLimit: number;
  liveCallsExhausted: boolean;
  elapsedMin: number;
  timeLimitMin: number;
  timeExhausted: boolean;
  budgetExhausted: boolean;
  exhaustedReason: StopReason | null;
}

export function checkBudget(): BudgetStatus {
  const state = getState();
  if (!state) {
    return {
      roundsUsed: 0, roundsLimit: 0, roundsExhausted: false,
      liveCallsUsed: 0, liveCallsLimit: 0, liveCallsExhausted: false,
      elapsedMin: 0, timeLimitMin: 0, timeExhausted: false,
      budgetExhausted: false, exhaustedReason: null,
    };
  }

  const budget: SelfImproveBudget = state.budget;
  const elapsed = elapsedMinutes();

  const roundsExhausted = state.currentRound >= budget.maxRounds;
  const liveCallsExhausted = state.liveModelCallsUsed >= budget.maxLiveModelCalls;
  const timeExhausted = elapsed >= budget.maxDurationMinutes;
  const exhausted = roundsExhausted || liveCallsExhausted || timeExhausted;

  let exhaustedReason: StopReason | null = null;
  if (roundsExhausted) exhaustedReason = "max_rounds_reached";
  else if (liveCallsExhausted) exhaustedReason = "budget_exhausted";
  else if (timeExhausted) exhaustedReason = "budget_exhausted";

  return {
    roundsUsed: state.currentRound,
    roundsLimit: budget.maxRounds,
    roundsExhausted,
    liveCallsUsed: state.liveModelCallsUsed,
    liveCallsLimit: budget.maxLiveModelCalls,
    liveCallsExhausted,
    elapsedMin: Math.round(elapsed * 10) / 10,
    timeLimitMin: budget.maxDurationMinutes,
    timeExhausted,
    budgetExhausted: exhausted,
    exhaustedReason,
  };
}

export function consumeLiveCall(count = 1): number {
  return trackLiveCall(count);
}

export function canAffordLiveCall(count = 1): boolean {
  const state = getState();
  if (!state) return false;
  return (state.liveModelCallsUsed + count) <= state.budget.maxLiveModelCalls;
}
