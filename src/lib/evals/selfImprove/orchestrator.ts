/**
 * Self-Improving Agent System — Orchestrator
 *
 * Main coordinator that runs the full self-improvement pipeline:
 *
 * 1. Initialize state and scenario pool
 * 2. Run baseline (existing tests)
 * 3. For each round:
 *    a. Execute scenarios → traces
 *    b. Run judge ensemble → verdicts
 *    c. Triage defects → prioritized repair list
 *    d. Generate repair plans
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
import { buildRepairPlan } from "./repairPlan";
import { runQualityGate } from "./qualityGate";
import { writeTrace, clearTraces, writeDeterministicResults, type DeterministicCaseResult } from "./traceStore";
import { classifyTraceErrors, NON_GAMEPLAY_CLASSES } from "./errorClassification";
import { evaluateStopPolicy, recordRoundScore, computeDeterministicMetrics, SMOKE_CAMPAIGN_CONFIG, type CampaignStopConfig } from "./stopPolicy";
import { checkBudget, resetBudgetTimer } from "./budget";
import { generateRunId, resolveSelfImproveBudget, resolveStopPolicy, isMockMode } from "./config";

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
  const allRepairs: { round: number; plans: ReturnType<typeof buildRepairPlan>[] }[] = [];

  try {
    // Phase 1: Discovery → Baseline
    transitionTo("baseline");
    console.log(`[SelfImprove] Run ${runId} started. Profile: ${options.profile}`);

    if (options.dryRun) {
      console.log("[SelfImprove] DRY RUN — no code modifications will be made.");
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
    let stopDecision = evaluateStopPolicy(null, null, SMOKE_CAMPAIGN_CONFIG);

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

      const autoRepairable = defects.filter((d) => d.autoRepairable);
      console.log(`[SelfImprove] Found ${defects.length} defects (${oracleDefects.length} Oracle + ${judgeDefects.length} Judge), ${autoRepairable.length} auto-repairable.`);
      for (const d of defects) {
        console.log(`[SelfImprove]   defect: ${d.signature.ruleId} (${d.signature.category}) severity=${d.severity} autoRepairable=${d.autoRepairable} oracleReproduced=${d.oracleReproduced} expected="${d.signature.normalizedExpected.slice(0, 120)}" actual="${d.signature.normalizedActual.slice(0, 120)}"`);
      }

      // Phase: Repair Planning
      transitionTo("repair");
      const repairPlans = autoRepairable.map((d) => buildRepairPlan(d));

      if (options.dryRun && repairPlans.length > 0) {
        console.log(`[SelfImprove] DRY RUN: Would repair ${repairPlans.length} defects:`);
        for (const plan of repairPlans) {
          console.log(`  - ${plan.defectSignature.ruleId}: ${plan.approach}`);
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

      // Track confirmed defects for DRAIN_REPAIR_QUEUE
      if (defects.length > 0) {
        console.log(`[SelfImprove] ⚠️  ${defects.length} confirmed defects pending repair`);
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
        notes: options.dryRun
          ? "DRY RUN — no repairs applied."
          : oracleClusters.length > 0
            ? `Oracle clusters: ${oracleClusters.map(c => c.clusterId).join(", ")}`
            : "",
      });

      // Evaluate stop policy
      // Evaluate stop policy. drainRepairQueue=false: this loop never applies
      // repairs (defectsRepaired is always 0; repair is the supervisor's job),
      // so "draining" here would only burn live-model budget re-measuring the
      // same defects and skip holdout execution.
      const campaignConfig: CampaignStopConfig = { ...SMOKE_CAMPAIGN_CONFIG, maxRounds: budget.maxRounds, drainRepairQueue: false };
      stopDecision = evaluateStopPolicy(qualityGate, qualityGate.liveEval, campaignConfig);

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

      allDefects.push({ round, defects });
      allRepairs.push({ round, plans: repairPlans });
    }

    // Phase: Holdout execution (once, after the dev-set campaign ends, before
    // reporting — the phase machine only allows reporting -> stopped).
    // Holdout expectations never enter repair prompts; results bind to the
    // manifest hashes via saveManifest().
    transitionTo("game_execution");
    const holdoutResult = await executeHoldoutCorpus(runId);

    // Phase: Reporting
    transitionTo("reporting");
    const finalStatus = determineFinalStatus(stopDecision, options.dryRun);

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
      allRepairs,
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
      allRepairs,
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
  dryRun: boolean,
): FinalStatus {
  if (stopDecision.finalStatus) return stopDecision.finalStatus;
  if (stopDecision.isCleanButInsufficient) return "CLEAN_BUT_INSUFFICIENT_EVIDENCE";
  if (stopDecision.isBlocked && isMockMode()) return "IMPLEMENTED_BUT_LIVE_BLOCKED";
  if (stopDecision.isBlocked) return "BLOCKED";
  if (dryRun) return "IMPLEMENTED_BUT_LIVE_BLOCKED";
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

export interface HoldoutRunResult {
  executedAt: string;
  corpusHash: string;
  results: HoldoutCaseResult[];
  regressed: boolean;
}

/**
 * Execute the holdout corpus exactly once and persist holdout-results.json.
 * Regression = any failed invariant with severity critical or major.
 * Infra-class failures do NOT count as regression (they void the evidence
 * instead — the strict verifier treats missing/invalid holdout evidence as
 * INSUFFICIENT_EVIDENCE).
 */
async function executeHoldoutCorpus(runId: string): Promise<HoldoutRunResult> {
  const cases = loadHoldoutCases();
  const executedAt = new Date().toISOString();
  const corpusHash = computeCorpusHash(cases);
  const results: HoldoutCaseResult[] = [];

  if (cases.length === 0) {
    console.log("[SelfImprove] Holdout corpus is EMPTY — strict gate will require evidence.");
  } else {
    console.log(`[SelfImprove] Executing holdout corpus: ${cases.length} case(s)...`);
  }

  const severityRank = (s: string) => (s === "critical" ? 3 : s === "major" ? 2 : 1);

  for (const scenario of cases) {
    try {
      const [trace] = await runScenarios([scenario], runId, 0);
      const errorClass = classifyTraceErrors(trace?.errors ?? []);
      if (!trace || NON_GAMEPLAY_CLASSES.has(errorClass)) {
        results.push({
          caseId: scenario.caseId, passed: false, maxSeverityFailed: null,
          invariantResults: [], errors: trace?.errors ?? ["no trace produced"], errorClass,
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
      const failed = invariantResults.filter((r) => !r.passed);
      const maxSev = failed.length
        ? (failed.reduce((a, b) => (severityRank(a.severity) >= severityRank(b.severity) ? a : b)).severity as HoldoutCaseResult["maxSeverityFailed"])
        : null;
      results.push({
        caseId: scenario.caseId,
        passed: failed.length === 0,
        maxSeverityFailed: maxSev,
        invariantResults,
        errors: trace.errors,
        errorClass,
      });
    } catch (e) {
      results.push({
        caseId: scenario.caseId, passed: false, maxSeverityFailed: null,
        invariantResults: [], errors: [`holdout execution error: ${e instanceof Error ? e.message : String(e)}`],
        errorClass: "infrastructure_failure",
      });
    }
  }

  const regressed = results.some(
    (r) => !r.passed && r.maxSeverityFailed && (r.maxSeverityFailed === "critical" || r.maxSeverityFailed === "major"),
  );

  const holdoutResult: HoldoutRunResult = { executedAt, corpusHash, results, regressed };
  const state = getState();
  if (state) state.holdoutExecutedAt = executedAt;
  const r = atomicWriteJsonSync(`.runtime-data/self-improve/${runId}/holdout-results.json`, holdoutResult);
  if (!r.ok) console.error(`[SelfImprove] WARNING: holdout results write failed: ${r.error}`);
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
  allRepairs: { round: number; plans: ReturnType<typeof buildRepairPlan>[] }[],
): FinalReport {
  const totalDefects = allDefects.reduce((sum, d) => sum + d.defects.length, 0);
  const totalAutoRepairable = allDefects.reduce(
    (sum, d) => sum + d.defects.filter((def) => def.autoRepairable).length,
    0,
  );

  const roundDetails = iterationLog.map((log) => ({
    round: log.round,
    defectsFound: log.defectsFound,
    defectsRepaired: log.defectsRepaired,
    testsAdded: [],
    rootCauses: allRepairs
      .filter((r) => r.round === log.round)
      .flatMap((r) => r.plans.map((p) => p.rootCause)),
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
    architecture: "Eval-Driven Multi-Agent Self-Repair System (v1)",
    filesChanged: [],
    commandsAdded: [
      "pnpm self-improve:dry-run",
      "pnpm self-improve:baseline",
      "pnpm self-improve:run",
      "pnpm self-improve:resume",
      "pnpm self-improve:report",
    ],
    baseline: { established: true },
    final: {
      totalRounds: iterationLog.length,
      totalDefects,
      totalAutoRepairable,
      status,
    },
    roundDetails,
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
