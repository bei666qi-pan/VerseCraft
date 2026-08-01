/**
 * Self-Improving Agent System — Stop Policy Unit Tests (v2)
 */

import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  evaluateStopPolicy,
  computeDeterministicMetrics,
  recordRoundScore,
  clearRoundHistory,
  SMOKE_CAMPAIGN_CONFIG,
  type CampaignStopConfig,
} from "./stopPolicy";
import { initState, incrementRound, transitionTo } from "./stateMachine";
import type { QualityGateResult } from "./types";

const TEST_RUN_ID = "test-stop-policy";

function makeQualityGate(overrides: Partial<QualityGateResult> = {}): QualityGateResult {
  return {
    round: 1,
    timestamp: new Date().toISOString(),
    deterministicTests: {
      total: 14, pass: 14, fail: 0, passRate: 1, allPassed: true,
      expectationMatchRate: 1.0,
      positiveCasesPassed: 12, expectedRejectionsObserved: 2,
      unexpectedFailures: 0, unexpectedPasses: 0,
    },
    newRegressionTests: { total: 0, pass: 0, allPassed: true },
    keepAliveTests: { total: 2, pass: 2, allPassed: true },
    requiredE2e: { total: 0, pass: 0, allPassed: true },
    buildPassed: true,
    liveEval: null,
    gatePassed: true,
    blockers: [],
    ...overrides,
  };
}

describe("Deterministic Metrics", () => {
  it("computes 14/14 when all expectations match", () => {
    const results = [
      { invariantResults: [{ expected: "pass", passed: true }, { expected: "pass", passed: true }] },
      { invariantResults: [{ expected: "fail", passed: true }] }, // correctly rejected
    ];
    const m = computeDeterministicMetrics(results);
    assert.equal(m.expectationMatches, 3);
    assert.equal(m.totalExpectations, 3);
    assert.equal(m.expectationMatchRate, 1.0);
    assert.equal(m.positiveCasesPassed, 2);
    assert.equal(m.totalPositiveCases, 2);
    assert.equal(m.expectedRejectionsObserved, 1);
    assert.equal(m.totalExpectedRejections, 1);
    assert.equal(m.unexpectedFailures, 0);
    assert.equal(m.unexpectedPasses, 0);
  });

  it("detects unexpected failures (positive test fails)", () => {
    const results = [
      { invariantResults: [{ expected: "pass", passed: false }] },
    ];
    const m = computeDeterministicMetrics(results);
    assert.equal(m.expectationMatchRate, 0);
    assert.equal(m.unexpectedFailures, 1);
  });

  it("detects unexpected passes (negative test passes incorrectly)", () => {
    const results = [
      { invariantResults: [{ expected: "fail", passed: false }] },
    ];
    const m = computeDeterministicMetrics(results);
    assert.equal(m.expectationMatchRate, 0);
    assert.equal(m.unexpectedPasses, 1);
  });

  it("handles empty results", () => {
    const m = computeDeterministicMetrics([]);
    assert.equal(m.expectationMatchRate, 1);
    assert.equal(m.totalExpectations, 0);
  });
});

describe("Stop Policy (Campaign Mode)", () => {
  beforeEach(() => {
    initState(TEST_RUN_ID);
    clearRoundHistory();
  });

  afterEach(() => {
    clearRoundHistory();
  });

  it("does NOT stop at round 1 with no defects (CLEAN_BUT_INSUFFICIENT)", () => {
    incrementRound(); // round 1
    recordRoundScore({
      round: 1, expectationMatchRate: 1, positivePassRate: 1,
      expectedRejectionsObserved: 2, averageJudgeScore: 5,
      criticalIssues: 0, majorIssues: 0,
    });

    const decision = evaluateStopPolicy(
      makeQualityGate(),
      null, // no live eval
      SMOKE_CAMPAIGN_CONFIG,
    );

    assert.equal(decision.shouldStop, false);
    assert.equal(decision.isCleanButInsufficient, true);
    assert.equal(decision.shouldExpandScenarios, true);
  });

  it("stops at maxRounds", () => {
    const shortConfig: CampaignStopConfig = { ...SMOKE_CAMPAIGN_CONFIG, maxRounds: 2, minRounds: 1 };
    for (let i = 0; i < shortConfig.maxRounds; i++) incrementRound();
    recordRoundScore({
      round: 2, expectationMatchRate: 1, positivePassRate: 1,
      expectedRejectionsObserved: 2, averageJudgeScore: 5,
      criticalIssues: 0, majorIssues: 0,
    });

    const decision = evaluateStopPolicy(
      makeQualityGate(),
      null,
      shortConfig,
    );

    assert.equal(decision.shouldStop, true);
    assert.equal(decision.finalStatus, "MAX_ROUNDS_REACHED");
  });

  it("drains repair queue by default when rounds exhausted with pending critical defects", () => {
    const config: CampaignStopConfig = { ...SMOKE_CAMPAIGN_CONFIG, maxRounds: 1, minRounds: 1, maxLiveModelCalls: 1000 };
    incrementRound();
    recordRoundScore({
      round: 1, expectationMatchRate: 1, positivePassRate: 1,
      expectedRejectionsObserved: 2, averageJudgeScore: 5,
      criticalIssues: 1, majorIssues: 0,
    });
    const decision = evaluateStopPolicy(makeQualityGate(), null, config);
    assert.equal(decision.shouldStop, false);
  });

  it("does NOT drain when drainRepairQueue=false (eval-only loops cannot repair)", () => {
    const config: CampaignStopConfig = { ...SMOKE_CAMPAIGN_CONFIG, maxRounds: 1, minRounds: 1, maxLiveModelCalls: 1000, drainRepairQueue: false };
    incrementRound();
    recordRoundScore({
      round: 1, expectationMatchRate: 1, positivePassRate: 1,
      expectedRejectionsObserved: 2, averageJudgeScore: 5,
      criticalIssues: 1, majorIssues: 0,
    });
    const decision = evaluateStopPolicy(makeQualityGate(), null, config);
    assert.equal(decision.shouldStop, true);
    assert.equal(decision.finalStatus, "MAX_ROUNDS_REACHED");
  });

  it("passes at minRounds when all criteria met", () => {
    const config: CampaignStopConfig = { ...SMOKE_CAMPAIGN_CONFIG, judgeCalibrationPassed: true, holdoutExecuted: true, keepAlivePassed: true };
    for (let i = 0; i < config.minRounds; i++) incrementRound();
    recordRoundScore({
      round: SMOKE_CAMPAIGN_CONFIG.minRounds, expectationMatchRate: 1,
      positivePassRate: 1, expectedRejectionsObserved: 2,
      averageJudgeScore: 5, criticalIssues: 0, majorIssues: 0,
    });

    // Live eval with all criteria met
    const liveEval = {
      coverage: 1.0,
      devSet: {
        totalCases: 14, passRate: 1, criticalIssues: 0, majorIssues: 0,
        coreGameplayLegalityRate: 1, npcFactViolations: 0,
        stateNarrativeConflicts: 0, averageJudgeScore: 5,
      },
      holdoutSet: { totalCases: 1, passRate: 1, criticalIssues: 0, majorIssues: 0, averageJudgeScore: 5 },
      holdoutRegressed: false,
      regressionDetails: [],
    };

    const decision = evaluateStopPolicy(
      makeQualityGate(),
      liveEval,
      config,
    );

    assert.equal(decision.shouldStop, true);
    assert.equal(decision.isSuccess, true);
    assert.equal(decision.finalStatus, "PASS");
  });

  it("detects regression when holdout regressed", () => {
    for (let i = 0; i < 3; i++) incrementRound();
    const liveEval = {
      coverage: 1.0,
      devSet: {
        totalCases: 14, passRate: 1, criticalIssues: 0, majorIssues: 0,
        coreGameplayLegalityRate: 1, npcFactViolations: 0,
        stateNarrativeConflicts: 0, averageJudgeScore: 5,
      },
      holdoutSet: { totalCases: 1, passRate: 0.5, criticalIssues: 0, majorIssues: 0, averageJudgeScore: 3 },
      holdoutRegressed: true,
      regressionDetails: ["holdout_pass_rate_dropped"],
    };

    const decision = evaluateStopPolicy(makeQualityGate(), liveEval, SMOKE_CAMPAIGN_CONFIG);
    assert.equal(decision.finalStatus, "REGRESSION_DETECTED");
  });

  it("blocks on live_blocked when no live eval at minRounds", () => {
    for (let i = 0; i < 3; i++) incrementRound();
    const decision = evaluateStopPolicy(makeQualityGate(), null, SMOKE_CAMPAIGN_CONFIG);
    assert.equal(decision.isBlocked, true);
    assert.ok(decision.finalStatus === "IMPLEMENTED_BUT_LIVE_BLOCKED" || decision.finalStatus === "BLOCKED");
  });
});
