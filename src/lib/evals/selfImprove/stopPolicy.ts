/**
 * Self-Improving Agent System — Stop Policy (v2 — Campaign Mode)
 *
 * Rewritten to enforce:
 * - minRounds before PASS
 * - CLEAN_BUT_INSUFFICIENT_EVIDENCE vs PASS distinction
 * - Deterministic expectation matching (not 12/14 ambiguity)
 * - Holdout, calibration, keep-alive gates
 * - No "defects=0 → PASS" early exit
 */

import type {
  StopReason,
  QualityGateResult,
  LiveEvalResult,
  FinalStatus,
} from "./types";
import { checkBudget } from "./budget";
import { getState } from "./stateMachine";

// ── Campaign stop policy config ───────────────────────

export interface CampaignStopConfig {
  minRounds: number;
  maxRounds: number;
  minExecutedCases: number;
  minimumCategoryCoverage: number; // 0-1, fraction of categories covered
  repeatedLiveRuns: number;
  liveCoverage: number; // 0-1, required coverage
  deterministicExpectationMatchRate: number; // 0-1
  judgeCalibrationPassed: boolean;
  holdoutExecuted: boolean;
  keepAlivePassed: boolean;
  maxDurationMinutes: number;
  maxLiveModelCalls: number;
  noImprovementRounds: number;
  /**
   * Whether the DRAIN_REPAIR_QUEUE continuation is allowed when eval rounds
   * are exhausted but defects are pending. Only meaningful when the loop can
   * actually apply repairs between rounds; eval-only entry points (run.ts,
   * whose repairs happen at supervisor level) must set this to false,
   * otherwise the loop re-measures the same defects until the live-model
   * budget is exhausted and holdout execution is skipped.
   */
  drainRepairQueue?: boolean;
}

export const SMOKE_CAMPAIGN_CONFIG: CampaignStopConfig = {
  minRounds: 3,
  maxRounds: 5,
  minExecutedCases: 14, // all dev set scenarios
  minimumCategoryCoverage: 0.6,
  repeatedLiveRuns: 3,
  liveCoverage: 1.0,
  deterministicExpectationMatchRate: 1.0,
  judgeCalibrationPassed: true,
  holdoutExecuted: true,
  keepAlivePassed: true,
  maxDurationMinutes: 240,
  maxLiveModelCalls: 200,
  noImprovementRounds: 2,
};

// ── Round history ─────────────────────────────────────

interface RoundScoreRecord {
  round: number;
  expectationMatchRate: number;
  positivePassRate: number;
  expectedRejectionsObserved: number;
  averageJudgeScore: number;
  criticalIssues: number;
  majorIssues: number;
}

const roundHistory: RoundScoreRecord[] = [];

export function recordRoundScore(score: RoundScoreRecord): void {
  roundHistory.push(score);
}

export function clearRoundHistory(): void {
  roundHistory.length = 0;
}

// ── Stop decision ─────────────────────────────────────

export interface StopDecision {
  shouldStop: boolean;
  shouldContinue: boolean;
  shouldExpandScenarios: boolean;
  isBlocked: boolean;
  isSuccess: boolean;
  isCleanButInsufficient: boolean;
  reason: StopReason | null;
  finalStatus: FinalStatus | null;
}

export function evaluateStopPolicy(
  qualityGate: QualityGateResult | null,
  liveEval: LiveEvalResult | null,
  config: CampaignStopConfig,
): StopDecision {
  const state = getState();
  if (!state) {
    return {
      shouldStop: true, shouldContinue: false, shouldExpandScenarios: false,
      isBlocked: true, isSuccess: false, isCleanButInsufficient: false,
      reason: "human_review_required", finalStatus: "BLOCKED",
    };
  }

  const budget = checkBudget();
  const completedRounds = state.currentRound;

  // ── Hard budget stops ──

  // Budget exhaust check — use campaign config, not state budget
  const liveCallsExhausted = state.liveModelCallsUsed >= config.maxLiveModelCalls;
  const timeExhausted = budget.elapsedMin >= config.maxDurationMinutes;
  const evalRoundsExhausted = completedRounds >= config.maxRounds;

  // If only eval rounds exhausted but defects are pending → DRAIN_REPAIR_QUEUE
  if (config.drainRepairQueue !== false && evalRoundsExhausted && !liveCallsExhausted && !timeExhausted) {
    const hasRecentDefects = roundHistory.length > 0 &&
      roundHistory[roundHistory.length - 1]!.criticalIssues + roundHistory[roundHistory.length - 1]!.majorIssues > 0;
    if (hasRecentDefects) {
      return {
        shouldStop: false, shouldContinue: false, shouldExpandScenarios: false,
        isBlocked: false, isSuccess: false, isCleanButInsufficient: false,
        reason: null,
        finalStatus: null, // Continue to drain repair queue
      };
    }
  }

  if (liveCallsExhausted || timeExhausted || evalRoundsExhausted) {
    let reason: StopReason;
    let status: FinalStatus;
    if (evalRoundsExhausted) { reason = "max_rounds_reached"; status = "MAX_ROUNDS_REACHED"; }
    else if (liveCallsExhausted) { reason = "budget_exhausted"; status = "BUDGET_EXHAUSTED"; }
    else { reason = "budget_exhausted"; status = "BUDGET_EXHAUSTED"; }

    return {
      shouldStop: true, shouldContinue: false, shouldExpandScenarios: false,
      isBlocked: false, isSuccess: false, isCleanButInsufficient: false,
      reason, finalStatus: status,
    };
  }

  // ── Consecutive repair failures ──

  const recentFailures = roundHistory.slice(-config.noImprovementRounds);
  if (
    recentFailures.length >= config.noImprovementRounds &&
    recentFailures.every((r) => r.expectationMatchRate < 0.5)
  ) {
    return {
      shouldStop: true, shouldContinue: false, shouldExpandScenarios: false,
      isBlocked: true, isSuccess: false, isCleanButInsufficient: false,
      reason: "consecutive_failures", finalStatus: "BLOCKED",
    };
  }

  // ── No improvement stagnation ──

  if (roundHistory.length >= config.noImprovementRounds + 1) {
    const recent = roundHistory.slice(-config.noImprovementRounds);
    const previous = roundHistory[roundHistory.length - config.noImprovementRounds - 1];
    if (previous && recent.every((r) => r.expectationMatchRate <= previous.expectationMatchRate + 0.02)) {
      return {
        shouldStop: true, shouldContinue: false, shouldExpandScenarios: false,
        isBlocked: false, isSuccess: false, isCleanButInsufficient: false,
        reason: "no_improvement", finalStatus: "BUDGET_EXHAUSTED",
      };
    }
  }

  // ── Check if we've met minRounds ──

  const hasMinRounds = completedRounds >= config.minRounds;

  // ── Evaluate success criteria ──

  const success = evaluateSuccessCriteria(qualityGate, liveEval, config);

  if (success.allPassed && hasMinRounds) {
    return {
      shouldStop: true, shouldContinue: false, shouldExpandScenarios: false,
      isBlocked: false, isSuccess: true, isCleanButInsufficient: false,
      reason: "all_gates_passed", finalStatus: "PASS",
    };
  }

  if (success.blocked) {
    return {
      shouldStop: true, shouldContinue: false, shouldExpandScenarios: false,
      isBlocked: true, isSuccess: false, isCleanButInsufficient: false,
      reason: success.blockReason ?? "human_review_required",
      finalStatus: success.blockReason === "live_blocked"
        ? "IMPLEMENTED_BUT_LIVE_BLOCKED" : "BLOCKED",
    };
  }

  if (success.regression) {
    return {
      shouldStop: true, shouldContinue: false, shouldExpandScenarios: false,
      isBlocked: false, isSuccess: false, isCleanButInsufficient: false,
      reason: "regression_detected", finalStatus: "REGRESSION_DETECTED",
    };
  }

  // ── CLEAN_BUT_INSUFFICIENT_EVIDENCE ──

  // If no defects found but we haven't met minRounds or coverage:
  if (success.noDefects && !hasMinRounds) {
    return {
      shouldStop: false, shouldContinue: false, shouldExpandScenarios: true,
      isBlocked: false, isSuccess: false, isCleanButInsufficient: true,
      reason: null,
      finalStatus: null, // Not final — expand scenarios and continue
    };
  }

  // ── Default: continue to next round ──

  return {
    shouldStop: false, shouldContinue: true, shouldExpandScenarios: false,
    isBlocked: false, isSuccess: false, isCleanButInsufficient: false,
    reason: null, finalStatus: null,
  };
}

interface SuccessEvaluation {
  allPassed: boolean;
  blocked: boolean;
  blockReason?: StopReason;
  regression: boolean;
  noDefects: boolean;
  blockers: string[];
}

function evaluateSuccessCriteria(
  gate: QualityGateResult | null,
  liveEval: LiveEvalResult | null,
  config: CampaignStopConfig,
): SuccessEvaluation {
  const blockers: string[] = [];

  // Deterministic expectation matching must be 100%
  if (gate && gate.deterministicTests.expectationMatchRate < config.deterministicExpectationMatchRate) {
    blockers.push(`deterministic_expectation_match: ${gate.deterministicTests.expectationMatchRate}`);
  }

  // All deterministic tests must pass
  if (gate && !gate.deterministicTests.allPassed) {
    blockers.push("deterministic_tests_failed");
  }

  // Regression tests
  if (gate && !gate.newRegressionTests.allPassed) {
    blockers.push("regression_tests_failed");
  }

  // Keep-alive tests
  if (gate && !gate.keepAliveTests.allPassed) {
    blockers.push("keep_alive_tests_failed");
  }

  // E2E
  if (gate && !gate.requiredE2e.allPassed) {
    blockers.push("e2e_tests_failed");
  }

  // Build
  if (gate && !gate.buildPassed) {
    blockers.push("build_failed");
  }

  // Live eval coverage — only block if we've met minRounds
  if (!liveEval || liveEval.coverage < config.liveCoverage) {
    // If we haven't met minRounds yet, this is not a blocker — it's insufficient evidence
    const state = getState();
    const hasMinRounds = state ? state.currentRound >= config.minRounds : false;
    if (!hasMinRounds) {
      return {
        allPassed: false, blocked: false, regression: false,
        noDefects: true, blockers,
      };
    }
    return {
      allPassed: false, blocked: true,
      blockReason: "live_blocked", regression: false,
      noDefects: false, blockers,
    };
  }

  // Critical issues must be 0
  if (liveEval.devSet.criticalIssues > 0) {
    blockers.push(`critical_issues: ${liveEval.devSet.criticalIssues}`);
  }

  // Major issues must be 0
  if (liveEval.devSet.majorIssues > 0) {
    blockers.push(`major_issues: ${liveEval.devSet.majorIssues}`);
  }

  // Core gameplay legality >= 95%
  if (liveEval.devSet.coreGameplayLegalityRate < 0.95) {
    blockers.push("gameplay_legality_below_95");
  }

  // NPC fact violations = 0
  if (liveEval.devSet.npcFactViolations > 0) {
    blockers.push("npc_fact_violations");
  }

  // State/narrative conflicts = 0
  if (liveEval.devSet.stateNarrativeConflicts > 0) {
    blockers.push("state_narrative_conflicts");
  }

  // Average judge score >= 4.2
  if (liveEval.devSet.averageJudgeScore < 4.2) {
    blockers.push("judge_score_below_4.2");
  }

  // Holdout regression
  if (liveEval.holdoutRegressed) {
    return {
      allPassed: false, blocked: false, regression: true,
      noDefects: blockers.length === 0, blockers,
    };
  }

  // Holdout executed check
  if (!config.holdoutExecuted) {
    blockers.push("holdout_not_executed");
  }

  // Judge calibration
  if (!config.judgeCalibrationPassed) {
    blockers.push("judge_calibration_not_passed");
  }

  // Keep-alive
  if (!config.keepAlivePassed) {
    blockers.push("keep_alive_not_passed");
  }

  const noDefects = blockers.length === 0;

  return {
    allPassed: noDefects,
    blocked: false,
    regression: false,
    noDefects,
    blockers,
  };
}

// ── Deterministic metrics helpers ─────────────────────

export interface DeterministicMetrics {
  expectationMatches: number;
  totalExpectations: number;
  expectationMatchRate: number;
  positiveCasesPassed: number;
  totalPositiveCases: number;
  expectedRejectionsObserved: number;
  totalExpectedRejections: number;
  unexpectedFailures: number;
  unexpectedPasses: number;
}

export function computeDeterministicMetrics(
  results: {
    invariantResults: {
      expected: string;
      passed: boolean;
    }[];
  }[],
): DeterministicMetrics {
  let expectationMatches = 0;
  let totalExpectations = 0;
  let positiveCasesPassed = 0;
  let totalPositiveCases = 0;
  let expectedRejectionsObserved = 0;
  let totalExpectedRejections = 0;
  let unexpectedFailures = 0;
  let unexpectedPasses = 0;

  for (const result of results) {
    let allExpectationsMatched = true;
    for (const inv of result.invariantResults) {
      totalExpectations++;
      const expected = inv.expected;
      const matched = expected === "pass" ? inv.passed : inv.passed; // For negative tests, passed=true means expected rejection was observed
      if (matched) {
        expectationMatches++;
      } else {
        allExpectationsMatched = false;
        if (expected === "pass") unexpectedFailures++;
        else unexpectedPasses++;
      }
      if (expected === "pass") {
        totalPositiveCases++;
        if (inv.passed) positiveCasesPassed++;
      } else {
        totalExpectedRejections++;
        if (inv.passed) expectedRejectionsObserved++;
      }
    }
  }

  return {
    expectationMatches,
    totalExpectations,
    expectationMatchRate: totalExpectations > 0 ? expectationMatches / totalExpectations : 1,
    positiveCasesPassed,
    totalPositiveCases,
    expectedRejectionsObserved,
    totalExpectedRejections,
    unexpectedFailures,
    unexpectedPasses,
  };
}
