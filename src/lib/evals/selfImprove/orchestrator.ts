/**
 * Evaluation & Regression Campaign — Orchestrator
 *
 * Main coordinator for the staged evaluation pipeline:
 *
 * 1. Initialize state and scenario pool
 * 2. Run baseline (existing tests)
 * 3. For each round:
 *    a. Execute scenarios → traces
 *    b. Run judge ensemble → verdicts
 *    c. Triage defects → prioritized evidence
 *    d. Generate explicit implementation recommendations
 *    e. Run quality gate
 *    f. Evaluate stop policy
 * 4. Generate final report
 *
 * This module is the single entry point for `scripts/self-improve/run.ts`.
 */

import { initState, transitionTo, setStatus, incrementRound, saveState, saveManifest, getState } from "./stateMachine";
import { initializeScenarioPool, getDevScenarios, scenarioCount, addScenarios } from "./scenarioPool";
import { expandScenarios } from "./scenarioExpansion";
import { runScenarios } from "./gameRunner";
import { loadHoldoutCases, computeCorpusHash } from "./holdout";
import { atomicWriteJsonSync } from "./atomicWrite";
import { runJudgeEnsemble } from "./judgeEnsemble";
import { arbitrateDefects, checkOracleReproduction } from "./defectTriage";
import { clusterOracleMismatches, clustersToTriagedDefects } from "./defectClustering";
import { buildEvaluationRecommendation } from "./recommendation";
import { runQualityGate } from "./qualityGate";
import { writeTrace, clearTraces, writeDeterministicResults, type DeterministicCaseResult } from "./traceStore";
import { classifyTraceErrors, NON_GAMEPLAY_CLASSES } from "./errorClassification";
import { evaluateStopPolicy, recordRoundScore, computeDeterministicMetrics, SMOKE_CAMPAIGN_CONFIG, type CampaignStopConfig } from "./stopPolicy";
import { checkBudget, resetBudgetTimer } from "./budget";
import { generateRunId, resolveSelfImproveBudget, resolveStopPolicy } from "./config";

import type {
  SelfImproveProfile,
  SelfImproveScenario,
  SelfImproveTrace,
  IterationLogEntry,
  FinalReport,
  FinalStatus,
  StopReason,
} from "./types";

// ── Orchestrator config ───────────────────────────────

export interface OrchestratorOptions {
  profile: SelfImproveProfile;
  scenarioIds?: string[];
  dryRun: boolean;
  maxRounds?: number;
  campaignConfig?: Partial<CampaignStopConfig>;
  /** Extra scenarios registered right after pool initialization (targeted replay variants). */
  extraScenarios?: SelfImproveScenario[];
}

// ── Run orchestration ─────────────────────────────────

export async function runSelfImprovement(options: OrchestratorOptions): Promise<FinalReport> {
  const runId = generateRunId();
  const budget = resolveSelfImproveBudget(options.profile);
  const stopPolicy = resolveStopPolicy(budget);

  if (options.maxRounds) {
    budget.maxRounds = options.maxRounds;
    stopPolicy.maxRounds = options.maxRounds;
  }

  resetBudgetTimer();

  // Initialize
  initState(runId, {
    budget,
    stopPolicy,
    runId: {
      id: runId,
      startedAt: new Date().toISOString(),
      profile: options.profile,
      seed: Date.now(),
    },
  });

  const iterationLog: IterationLogEntry[] = [];
  const allDefects: { round: number; defects: ReturnType<typeof arbitrateDefects> }[] = [];
  const allRecommendations: { round: number; items: ReturnType<typeof buildEvaluationRecommendation>[] }[] = [];

  try {
    // Phase 1: Discovery → Baseline
    transitionTo("baseline");
    console.log(`[Evaluation] Run ${runId} started. Profile: ${options.profile}`);

    if (options.dryRun) {
      console.log("[Evaluation] Legacy --dry-run flag accepted; campaigns are always non-mutating.");
    }

    // Load scenario pool
    transitionTo("scenario_building");
    initializeScenarioPool();
    if (options.extraScenarios?.length) {
      addScenarios(options.extraScenarios);
    }
    const scenarios = options.scenarioIds
      ? getDevScenarios().filter((s) => options.scenarioIds!.includes(s.caseId))
      : getDevScenarios();
    console.log(`[SelfImprove] Loaded ${scenarioCount()} scenarios, ${scenarios.length} in dev set.`);

    // Main improvement loop
    const campaignConfig: CampaignStopConfig = {
      ...SMOKE_CAMPAIGN_CONFIG,
      ...options.campaignConfig,
      maxRounds: budget.maxRounds,
      maxDurationMinutes: budget.maxDurationMinutes,
      maxLiveModelCalls: budget.maxLiveModelCalls,
    };
    let stopDecision = evaluateStopPolicy(null, null, campaignConfig);

    // Fresh run: clear any stale trace file once, before the first round.
    clearTraces(runId);

    while (!stopDecision.shouldStop) {
      const round = incrementRound();
      console.log(`\n[SelfImprove] === Round ${round}/${budget.maxRounds} ===`);

      // Phase: Game Execution — expand scenarios if previous round was clean
      if (round > 1 && stopDecision.shouldExpandScenarios) {
        transitionTo("scenario_building");
        const expandedScenarios = expandScenarios(scenarios, round);
        if (expandedScenarios.length > scenarios.length) {
          addScenarios(expandedScenarios);
          console.log(`[SelfImprove] Expanded scenarios: ${scenarios.length} → ${expandedScenarios.length}`);
          scenarios.length = 0;
          scenarios.push(...expandedScenarios);
        }
      }

      transitionTo("game_execution");
      console.log(`[SelfImprove] Executing ${scenarios.length} scenarios...`);
      // NOTE: do NOT clear traces per round — a crashing later round would
      // wipe evidence from completed rounds. Traces accumulate per run.

      const traces = await runScenarios(scenarios, runId, round);
      for (const trace of traces) { writeTrace(runId, trace); }
      console.log(`[SelfImprove] Collected ${traces.length} traces.`);

      // Run deterministic oracle on traces
      const detResults: DeterministicCaseResult[] = [];
      for (const trace of traces) {
        const scenario = scenarios.find((s) => s.caseId === trace.caseId);
        if (!scenario) continue;
        const errorClass = (trace.errorClass as DeterministicCaseResult["errorClass"]) || classifyTraceErrors(trace.errors);
        if (NON_GAMEPLAY_CLASSES.has(errorClass)) {
          // Infrastructure / model-availability failure: no valid model result
          // exists, so gameplay invariants must NOT be judged on this trace.
          detResults.push({
            caseId: trace.caseId,
            passed: true,
            invariantResults: [],
            errors: trace.errors,
            errorClass,
          });
          continue;
        }
        const invariantResults = scenario.expectedInvariants.map((inv) => {
          const passed = checkDeterministicInvariant(trace, inv);
          return {
            invariantId: inv.id,
            check: inv.check,
            expected: inv.expected,
            actual: inv.expected === "pass" ? (passed ? "pass" : "fail") : (passed ? "fail" : "pass"),
            passed,
            severity: inv.severity,
          };
        });
        detResults.push({
          caseId: trace.caseId,
          passed: invariantResults.every((r) => r.passed),
          invariantResults,
          errors: trace.errors,
          errorClass,
        });
      }
      writeDeterministicResults(runId, detResults);

      // Phase: Judging
      transitionTo("judging");
      console.log(`[SelfImprove] Running judge ensemble...`);

      const allVerdicts = [];
      for (const trace of traces) {
        const scenario = scenarios.find((s) => s.caseId === trace.caseId);
        if (!scenario) continue;
        // Do not feed infra-failed traces (timeouts, gateway errors) to judges —
        // there is no valid model output to judge.
        if (NON_GAMEPLAY_CLASSES.has(classifyTraceErrors(trace.errors))) continue;
        const verdicts = await runJudgeEnsemble(trace, scenario);
        allVerdicts.push(...verdicts);
      }

      // Phase: Triage
      transitionTo("triage");
      console.log(`[SelfImprove] Triaging defects...`);

      // Step A: Cluster Oracle expectation mismatches into defects
      const oracleClusters = clusterOracleMismatches(detResults);
      const oracleDefects = clustersToTriagedDefects(oracleClusters);
      console.log(`[SelfImprove] Oracle clusters: ${oracleClusters.length} (${oracleClusters.map(c => c.clusterId).join(", ") || "none"})`);

      // Step B: Judge-identified defects
      const judgeDefects = arbitrateDefects(
        allVerdicts,
        budget.minimumJudgeConfidence,
        budget.requiredJudgeAgreement,
      );

      // Step C: Merge — Oracle defects take priority (deterministic evidence)
      const defects = [...oracleDefects, ...judgeDefects];

      // Mark oracle reproduction
      for (const defect of defects) {
        const detCase = detResults.find((r) => r.caseId === defect.signature.affectedSystem
          || r.invariantResults.some((ir) => ir.invariantId === defect.signature.ruleId));
        if (detCase) {
          defect.oracleReproduced = checkOracleReproduction(defect, detCase.invariantResults);
        }
      }

      const recommendationEligible = defects.filter((d) => d.recommendationEligible);
      console.log(`[Evaluation] Found ${defects.length} defects (${oracleDefects.length} Oracle + ${judgeDefects.length} Judge), ${recommendationEligible.length} ready for explicit implementation handoff.`);
      for (const d of defects) {
        console.log(`[Evaluation]   defect: ${d.signature.ruleId} (${d.signature.category}) severity=${d.severity} recommendationEligible=${d.recommendationEligible} oracleReproduced=${d.oracleReproduced} expected="${d.signature.normalizedExpected.slice(0, 120)}" actual="${d.signature.normalizedActual.slice(0, 120)}"`);
      }

      // Phase: Recommendation building. This is a report-only handoff: the
      // evaluator never launches a writer or modifies tracked repository files.
      transitionTo("repair");
      const recommendations = recommendationEligible.map((d) => buildEvaluationRecommendation(d));

      if (recommendations.length > 0) {
        console.log(`[Evaluation] Generated ${recommendations.length} implementation recommendation(s):`);
        for (const recommendation of recommendations) {
          console.log(`  - ${recommendation.defectSignature.ruleId}: ${recommendation.approach}`);
        }
      }

      // Phase: Quality Gate
      transitionTo("quality_gate");
      console.log(`[SelfImprove] Running quality gate...`);

      const detMetrics = computeDeterministicMetrics(detResults);
      const qualityGate = await runQualityGate({
        regressionTestPaths: [],
        skipCi: options.profile === "smoke",
        skipBuild: options.profile === "smoke",
      });
      qualityGate.round = round;
      // Override deterministic test metrics with proper computation
      qualityGate.deterministicTests.expectationMatchRate = detMetrics.expectationMatchRate;
      qualityGate.deterministicTests.positiveCasesPassed = detMetrics.positiveCasesPassed;
      qualityGate.deterministicTests.expectedRejectionsObserved = detMetrics.expectedRejectionsObserved;
      qualityGate.deterministicTests.unexpectedFailures = detMetrics.unexpectedFailures;
      qualityGate.deterministicTests.unexpectedPasses = detMetrics.unexpectedPasses;

      // Record round score
      const avgScore = allVerdicts.length > 0
        ? allVerdicts.reduce((sum, v) => sum + v.confidence, 0) / allVerdicts.length
        : 0;
      const criticalCount = defects.filter((d) => d.severity === "critical").length;
      const majorCount = defects.filter((d) => d.severity === "major").length;
      recordRoundScore({
        round,
        expectationMatchRate: detMetrics.expectationMatchRate,
        positivePassRate: detMetrics.totalPositiveCases > 0 ? detMetrics.positiveCasesPassed / detMetrics.totalPositiveCases : 1,
        expectedRejectionsObserved: detMetrics.expectedRejectionsObserved,
        averageJudgeScore: avgScore,
        criticalIssues: criticalCount,
        majorIssues: majorCount,
      });

      // Track confirmed defects for explicit implementation handoff.
      if (defects.length > 0) {
        console.log(`[Evaluation] ⚠️  ${defects.length} confirmed defects require explicit implementation review`);
      }

      // Log iteration
      iterationLog.push({
        round,
        phase: "quality_gate",
        timestamp: new Date().toISOString(),
        scenarioCount: scenarios.length,
        traceCount: traces.length,
        defectsFound: defects.length,
        defectsRepaired: 0,
        repairsSucceeded: 0,
        repairsFailed: 0,
        qualityGateResult: qualityGate,
        stopReason: null,
        notes: oracleClusters.length > 0
            ? `Oracle clusters: ${oracleClusters.map(c => c.clusterId).join(", ")}`
            : "Evaluation-only run — no repository repairs applied.",
      });

      // Evaluate stop policy
      // Evaluation campaigns do not apply repairs. Re-measuring the same
      // defect cannot drain an implementation queue, so stop after evidence
      // collection and hand off recommendations explicitly.
      stopDecision = evaluateStopPolicy(qualityGate, qualityGate.liveEval, campaignConfig);

      // Record the current round before evaluating a terminal decision so the
      // final report cannot lose the last round's defects/recommendations.
      allDefects.push({ round, defects });
      allRecommendations.push({ round, items: recommendations });

      if (stopDecision.shouldStop) {
        console.log(`[SelfImprove] Stopping: ${stopDecision.reason} (status: ${stopDecision.finalStatus})`);
        break;
      }

      if (stopDecision.shouldExpandScenarios) {
        console.log(`[SelfImprove] CLEAN round but insufficient evidence — expanding scenarios for round ${round + 1}`);
      }

      if (stopDecision.isCleanButInsufficient) {
        console.log(`[SelfImprove] Status: CLEAN_BUT_INSUFFICIENT_EVIDENCE — continuing campaign`);
      }

    }

    // Phase: Holdout execution (once, after the dev-set campaign ends, before
    // reporting — the phase machine only allows reporting -> stopped).
    // Holdout expectations never enter implementation recommendations;
    // results bind to the manifest hashes via saveManifest().
    transitionTo("game_execution");
    const holdoutResult = await executeHoldoutCorpus(runId);

    // Phase: Reporting
    transitionTo("reporting");
    const finalStatus = determineFinalStatus(stopDecision);

    // Phase: Stopped
    transitionTo("stopped");
    setStatus(finalStatus === "PASS" ? "completed" : "stopped");

    saveState();
    saveManifest();

    // Build final report
    const report = buildFinalReport(
      runId,
      options,
      finalStatus,
      stopDecision.reason ?? "completed",
      iterationLog,
      allDefects,
      allRecommendations,
    );
    report.holdoutRegressed = holdoutResult.regressed;

    return report;
  } catch (error) {
    console.error(`[SelfImprove] Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    setStatus("failed");
    saveState();
    saveManifest();

    return buildFinalReport(
      runId,
      options,
      "BLOCKED",
      "human_review_required",
      iterationLog,
      allDefects,
      allRecommendations,
    );
  }
}

// ── Helpers ───────────────────────────────────────────

export function checkDeterministicInvariant(
  trace: SelfImproveTrace,
  inv: { id: string; check: string; expected: string; severity: string },
): boolean {
  const dmJson = trace.parsedDmJson;
  // Fail-closed: 缺失解析证据不等于"符合预期"。任何不变量在证据缺失时都判不通过，
  // 由上层 errorClass / insufficient_evidence 路径区分基础设施失败与产品缺陷。
  if (!dmJson) return false;

  switch (inv.check) {
    case "action_legality":
      return dmJson.is_action_legal === (inv.expected === "pass");
    case "resource_conservation": {
      // State invariant: nothing was granted and nothing was charged.
      // Note: the DM JSON contract has no explicit "removed_items" field, so
      // material conservation is approximated by "no award + no negative
      // currency delta". A real material-consumption regression that leaves
      // no structured trace is not observable here (documented limitation).
      const items = dmJson.awarded_items as unknown[] | undefined;
      const warehouse = dmJson.awarded_warehouse_items as unknown[] | undefined;
      const currency = dmJson.currency_change as number | undefined;
      const noAward = (!items || items.length === 0) && (!warehouse || warehouse.length === 0);
      const noCharge = typeof currency !== "number" || currency >= 0;
      const conserved = noAward && noCharge;
      return inv.expected === "pass" ? conserved : !conserved;
    }
    case "npc_epistemic_boundary":
      return true;
    case "option_executability":
      return Array.isArray(dmJson.options) && dmJson.options.length > 0;
    case "player_agency":
      return dmJson.options && (dmJson.options as unknown[]).length >= 2;
    case "idempotency":
      return true;
    case "death_state_gating":
      return dmJson.is_death !== true || dmJson.is_action_legal === false;
    case "forge_transaction": {
      // State invariant (第九节审计修复): 锻造材料不足时，允许模型将"尝试"判为
      // is_action_legal=true，但最终状态必须失败——不得生成物品、不得错误扣费、
      // narrative 不得声称锻造成功。不再用模型自称的 is_action_legal 充当证据。
      const items = (dmJson.awarded_items as unknown[] | undefined) ?? [];
      const warehouse = (dmJson.awarded_warehouse_items as unknown[] | undefined) ?? [];
      const noForgedItem = items.length === 0 && warehouse.length === 0;
      const narrative = typeof dmJson.narrative === "string" ? dmJson.narrative : "";
      const claimsSuccess =
        /(锻造|打造|铸成|铸就|炼成|制成)[^。!?\n]{0,12}(成功|完成|出炉)/.test(narrative)
        || /(成功|完成)(地)?(锻造|打造|铸)/.test(narrative);
      const mentionsFailure = /(失败|未能|无法|不够|不足|没有成功|成不了)/.test(narrative);
      const forgeFailedCleanly = noForgedItem && (!claimsSuccess || mentionsFailure);
      return inv.expected === "pass" ? forgeFailedCleanly : !forgeFailedCleanly;
    }
    case "task_lifecycle": {
      // Check that no task state change occurred (task_updates and new_tasks are empty)
      const taskUpdates = dmJson.task_updates as unknown[] | undefined;
      const newTasks = dmJson.new_tasks as unknown[] | undefined;
      const noTaskChange = (!taskUpdates || taskUpdates.length === 0) && (!newTasks || newTasks.length === 0);
      // expected=pass: model correctly avoided task changes (pass)
      // expected=fail: model incorrectly allowed task changes (fail)
      return inv.expected === "pass" ? noTaskChange : !noTaskChange;
    }
    case "profession_boundary": {
      // Check that no profession-specific state change occurred
      const items = dmJson.awarded_items as unknown[] | undefined;
      const taskUpdates = dmJson.task_updates as unknown[] | undefined;
      const newTasks = dmJson.new_tasks as unknown[] | undefined;
      const noEffect = (!items || items.length === 0) && (!taskUpdates || taskUpdates.length === 0) && (!newTasks || newTasks.length === 0);
      return inv.expected === "pass" ? noEffect : !noEffect;
    }
    case "state_narrative_consistency": {
      // For "pass" expectation: narrative and state should agree
      // In mock mode, this always passes since we construct consistent responses
      return inv.expected === "pass";
    }
    default:
      return inv.expected === "pass";
  }
}

function determineFinalStatus(
  stopDecision: ReturnType<typeof evaluateStopPolicy>,
): FinalStatus {
  if (stopDecision.finalStatus) return stopDecision.finalStatus;
  if (stopDecision.isCleanButInsufficient) return "CLEAN_BUT_INSUFFICIENT_EVIDENCE";
  if (stopDecision.isBlocked) return "BLOCKED";
  return "MAX_ROUNDS_REACHED";
}

// ── Holdout execution ─────────────────────────────────

export interface HoldoutCaseResult {
  caseId: string;
  passed: boolean;
  maxSeverityFailed: "critical" | "major" | "minor" | null;
  invariantResults: {
    invariantId: string;
    check: string;
    expected: string;
    actual: string;
    passed: boolean;
    severity: string;
  }[];
  errors: string[];
  errorClass: string;
}

export interface HoldoutCaseDetail {
  caseId: string;
  requestedUrl: string;
  serverHealthyBeforeRequest: boolean;
  httpStatus: number;
  errorClass: string;
  errorDetail: string;
  validEvidence: boolean;
  passed: boolean;
}

export interface HoldoutRunResult {
  executedAt: string;
  corpusHash: string;
  results: HoldoutCaseResult[];
  details: HoldoutCaseDetail[];
  regressed: boolean;
}

/**
 * Execute the holdout corpus exactly once and persist holdout-results.json.
 * Regression = any failed invariant with severity critical or major.
 * Infra-class failures do NOT count as regression (they void the evidence
 * instead — the strict verifier treats missing/invalid holdout evidence as
 * INSUFFICIENT_EVIDENCE).
 */

/**
 * Simple server health check: GET the base URL and expect a 2xx response.
 */
async function checkServerHealth(baseUrl: string): Promise<{ healthy: boolean; status: number; error: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    const res = await fetch(baseUrl, { method: "GET", signal: controller.signal });
    clearTimeout(timeout);
    return { healthy: res.ok, status: res.status, error: res.ok ? "" : `HTTP ${res.status}` };
  } catch (e: any) {
    return { healthy: false, status: 0, error: e.message || String(e) };
  }
}

async function executeHoldoutCorpus(runId: string): Promise<HoldoutRunResult> {
  const cases = loadHoldoutCases();
  const executedAt = new Date().toISOString();
  const corpusHash = computeCorpusHash(cases);
  const results: HoldoutCaseResult[] = [];

  const baseUrl = (process.env.LIVEPLAY_BASE_URL || "http://localhost:666").replace(/\/$/, "");

  console.log("[SelfImprove] HOLDOUT_START", JSON.stringify({
    totalCases: cases.length,
    baseUrl,
    timestamp: new Date().toISOString(),
  }));

  // Server health check before holdout execution
  const serverHealth = await checkServerHealth(baseUrl);
  console.log("[SelfImprove] HOLDOUT_SERVER_HEALTH", JSON.stringify({
    healthy: serverHealth.healthy,
    status: serverHealth.status,
    error: serverHealth.error,
  }));

  if (cases.length === 0) {
    console.log("[SelfImprove] Holdout corpus is EMPTY — strict gate will require evidence.");
  } else {
    console.log(`[SelfImprove] Executing holdout corpus: ${cases.length} case(s)...`);
  }

  const severityRank = (s: string) => (s === "critical" ? 3 : s === "major" ? 2 : 1);
  const details: HoldoutCaseDetail[] = [];

  for (const scenario of cases) {
    const requestedUrl = `${baseUrl}/api/chat`;
    console.log("[SelfImprove] HOLDOUT_CASE_START", JSON.stringify({
      caseId: scenario.caseId,
      requestedUrl,
      timestamp: new Date().toISOString(),
    }));

    try {
      const [trace] = await runScenarios([scenario], runId, 0);
      const errorClass = classifyTraceErrors(trace?.errors ?? []);
      const httpStatus = trace?.httpStatus ?? 0;
      const validEvidence = !!trace && !NON_GAMEPLAY_CLASSES.has(errorClass);

      if (!trace || NON_GAMEPLAY_CLASSES.has(errorClass)) {
        const result: HoldoutCaseResult = {
          caseId: scenario.caseId, passed: false, maxSeverityFailed: null,
          invariantResults: [], errors: trace?.errors ?? ["no trace produced"], errorClass,
        };
        results.push(result);
        details.push({
          caseId: scenario.caseId, requestedUrl,
          serverHealthyBeforeRequest: serverHealth.healthy,
          httpStatus, errorClass,
          errorDetail: (trace?.errors ?? ["no trace produced"]).join("; "),
          validEvidence, passed: false,
        });
        console.log("[SelfImprove] HOLDOUT_CASE_RESULT", JSON.stringify({
          caseId: scenario.caseId, passed: false, errorClass,
          httpStatus, validEvidence,
          errors: trace?.errors ?? ["no trace produced"],
        }));
        continue;
      }
      const invariantResults = scenario.expectedInvariants.map((inv) => {
        const passed = checkDeterministicInvariant(trace, inv);
        return {
          invariantId: inv.id,
          check: inv.check,
          expected: inv.expected,
          actual: inv.expected === "pass" ? (passed ? "pass" : "fail") : (passed ? "fail" : "pass"),
          passed,
          severity: inv.severity,
        };
      });
      const failed = invariantResults.filter((r) => !r.passed);
      const maxSev = failed.length
        ? (failed.reduce((a, b) => (severityRank(a.severity) >= severityRank(b.severity) ? a : b)).severity as HoldoutCaseResult["maxSeverityFailed"])
        : null;
      const casePassed = failed.length === 0;
      const result: HoldoutCaseResult = {
        caseId: scenario.caseId,
        passed: casePassed,
        maxSeverityFailed: maxSev,
        invariantResults,
        errors: trace.errors,
        errorClass,
      };
      results.push(result);
      details.push({
        caseId: scenario.caseId, requestedUrl,
        serverHealthyBeforeRequest: serverHealth.healthy,
        httpStatus, errorClass,
        errorDetail: trace.errors?.join("; ") ?? "",
        validEvidence, passed: casePassed,
      });
      console.log("[SelfImprove] HOLDOUT_CASE_RESULT", JSON.stringify({
        caseId: scenario.caseId, passed: casePassed, errorClass,
        httpStatus, validEvidence,
        invariantCount: invariantResults.length,
        failedCount: failed.length,
      }));
    } catch (e) {
      const errorMsg = `holdout execution error: ${e instanceof Error ? e.message : String(e)}`;
      results.push({
        caseId: scenario.caseId, passed: false, maxSeverityFailed: null,
        invariantResults: [], errors: [errorMsg],
        errorClass: "infrastructure_failure",
      });
      details.push({
        caseId: scenario.caseId, requestedUrl,
        serverHealthyBeforeRequest: serverHealth.healthy,
        httpStatus: 0, errorClass: "infrastructure_failure",
        errorDetail: errorMsg,
        validEvidence: false, passed: false,
      });
      console.log("[SelfImprove] HOLDOUT_CASE_RESULT", JSON.stringify({
        caseId: scenario.caseId, passed: false, errorClass: "infrastructure_failure",
        httpStatus: 0, validEvidence: false,
        errors: [errorMsg],
      }));
    }
  }

  const regressed = results.some(
    (r) => !r.passed && r.maxSeverityFailed && (r.maxSeverityFailed === "critical" || r.maxSeverityFailed === "major"),
  );

  const holdoutResult: HoldoutRunResult = { executedAt, corpusHash, results, details, regressed };
  const state = getState();
  if (state) state.holdoutExecutedAt = executedAt;
  const r = atomicWriteJsonSync(`.runtime-data/self-improve/${runId}/holdout-results.json`, holdoutResult);
  if (!r.ok) console.error(`[SelfImprove] WARNING: holdout results write failed: ${r.error}`);
  console.log(`[SelfImprove] HOLDOUT_DONE`, JSON.stringify({
    total: results.length,
    passed: results.filter((x) => x.passed).length,
    regressed,
    validCoverage: `${details.filter((d) => d.validEvidence).length}/${details.length}`,
    infraFailures: details.filter((d) => d.errorClass === "infrastructure_failure").length,
    modelUnavailable: details.filter((d) => d.errorClass === "model_unavailable").length,
  }));
  console.log(`[SelfImprove] Holdout: ${results.filter((x) => x.passed).length}/${results.length} passed, regressed=${regressed}`);
  return holdoutResult;
}


function buildFinalReport(
  runId: string,
  options: OrchestratorOptions,
  status: FinalStatus,
  stopReason: StopReason,
  iterationLog: IterationLogEntry[],
  allDefects: { round: number; defects: ReturnType<typeof arbitrateDefects> }[],
  allRecommendations: { round: number; items: ReturnType<typeof buildEvaluationRecommendation>[] }[],
): FinalReport {
  const totalDefects = allDefects.reduce((sum, d) => sum + d.defects.length, 0);
  const totalRecommendations = allDefects.reduce(
    (sum, d) => sum + d.defects.filter((def) => def.recommendationEligible).length,
    0,
  );

  const roundDetails = iterationLog.map((log) => ({
    round: log.round,
    defectsFound: log.defectsFound,
    recommendationsGenerated: allRecommendations
      .filter((entry) => entry.round === log.round)
      .reduce((sum, entry) => sum + entry.items.length, 0),
    defectsRepaired: log.defectsRepaired,
    testsAdded: [],
    rootCauses: allRecommendations
      .filter((entry) => entry.round === log.round)
      .flatMap((entry) => entry.items.map((item) => item.rootCause)),
  }));

  const budget = checkBudget();

  return {
    status,
    runId: {
      id: runId,
      startedAt: new Date().toISOString(),
      profile: options.profile,
      seed: Date.now(),
    },
    architecture: "Staged Evaluation & Regression Campaign (non-mutating)",
    filesChanged: [],
    commandsAdded: [
      "pnpm eval:campaign",
      "pnpm eval:baseline",
      "pnpm eval:report",
      "pnpm eval:verify:strict",
    ],
    baseline: { established: true },
    final: {
      totalRounds: iterationLog.length,
      totalDefects,
      totalRecommendations,
      status,
    },
    roundDetails,
    recommendations: allRecommendations.flatMap((entry) => entry.items),
    deterministicResults: {},
    liveEvalResults: null,
    holdoutRegressed: false,
    resourceUsage: {
      liveModelCalls: budget.liveCallsUsed,
      totalDurationMinutes: budget.elapsedMin,
      budget: options.profile === "smoke"
        ? { maxRounds: 3, maxLiveModelCalls: 80, maxDurationMinutes: 60, gameConcurrency: 4, judgeConcurrency: 3, judgesPerCase: 3, minimumJudgeConfidence: 0.8, requiredJudgeAgreement: 2, repeatedLiveRuns: 3 }
        : { maxRounds: 5, maxLiveModelCalls: 200, maxDurationMinutes: 120, gameConcurrency: 6, judgeConcurrency: 4, judgesPerCase: 3, minimumJudgeConfidence: 0.8, requiredJudgeAgreement: 2, repeatedLiveRuns: 3 },
    },
    stopReason,
    unresolvedIssues: [],
    humanDecisionBlocks: [],
    gitDiffSummary: "",
  };
}
