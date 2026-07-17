#!/usr/bin/env tsx
/**
 * Dedicated real live counterfactual campaign.
 *
 * Runs paired scenarios with the same pre-state but different actions,
 * then evaluates which branches produce truly different structured outcomes.
 * Focuses on low-cost deterministic action paths and avoids live player-agent calls.
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { type CounterfactualChoiceAssessment, assessCounterfactualChoice } from "../src/lib/evals/productQuality/counterfactualChoice";
import { runPlaythroughBatchV3 } from "../src/lib/evals/playthrough/orchestrator";
import { SCENARIOS, type Scenario } from "../src/lib/evals/playthrough/scenarios";
import { resolveCampaignExecution } from "./liveExecutionMode";

type TraceArtifact = {
  runId: string;
  scenarioId: string;
  initialState?: Record<string, unknown>;
  steps?: Array<{ playerAction?: unknown; dmJson?: Record<string, unknown>; stateSnapshot?: Record<string, unknown>; stateAfter?: Record<string, unknown> }>;
};

interface CounterfactualPairAssessment {
  group: string;
  left: { scenarioId: string; branch?: string; runId: string; path: string };
  right: { scenarioId: string; branch?: string; runId: string; path: string };
  assessment: CounterfactualChoiceAssessment;
}

const baseUrl = process.env.LIVEPLAY_BASE_URL ?? "http://127.0.0.1:666";
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = resolve(".runtime-data/eval", `live-counterfactual-full-${runId}`);
const traceDir = resolve(outDir, "traces");

const scenarioIds = [
  "choice-shadow-attack",
  "choice-shadow-recon",
  "forge-service-quote-only",
  "forge-service-execute",
  "profession-trial-delivery-observe",
  "profession-trial-delivery-commit",
] as const;

const scenarioById = new Map<string, Scenario>(SCENARIOS.map((s) => [s.id, s]));

async function loadTraces(): Promise<TraceArtifact[]> {
  const files = await readdir(traceDir);
  const runs: TraceArtifact[] = [];
  for (const file of files) {
    if (extname(file).toLowerCase() !== ".json") continue;
    const fullPath = resolve(traceDir, file);
    const parsed = JSON.parse(await readFile(fullPath, "utf8")) as TraceArtifact;
    runs.push(parsed);
  }
  return runs;
}

function combineToRun(trace: TraceArtifact) {
  return {
    scenarioId: trace.scenarioId,
    initialState: trace.initialState,
    steps: (trace.steps ?? []).map((step) => ({
      playerAction: step.playerAction,
      dmJson: step.dmJson ?? {},
      stateSnapshot: step.stateSnapshot ?? step.stateAfter,
    })),
  };
}

function buildCounterfactualPairs(traces: TraceArtifact[]): CounterfactualPairAssessment[] {
  const byGroup = new Map<string, Map<string, TraceArtifact[]>>();
  for (const trace of traces) {
    const scenario = scenarioById.get(trace.scenarioId);
    if (!scenario?.counterfactualGroup) continue;
    const branches = byGroup.get(scenario.counterfactualGroup) ?? new Map<string, TraceArtifact[]>();
    const list = branches.get(scenario.counterfactualBranch ?? "default") ?? [];
    list.push(trace);
    branches.set(scenario.counterfactualBranch ?? "default", list);
    byGroup.set(scenario.counterfactualGroup, branches);
  }

  const results: CounterfactualPairAssessment[] = [];
  for (const [group, branches] of byGroup) {
    const keys = [...branches.keys()].sort();
    for (let i = 0; i < keys.length; i += 1) {
      for (let j = i + 1; j < keys.length; j += 1) {
        const left = branches.get(keys[i]);
        const right = branches.get(keys[j]);
        if (!left || !right || left.length === 0 || right.length === 0) continue;
        const a = combineToRun(left[0]!);
        const b = combineToRun(right[0]!);
        const assessment = assessCounterfactualChoice(a, b);
        results.push({
          group,
          left: { scenarioId: left[0]!.scenarioId, branch: keys[i], runId: left[0]!.runId, path: resolve(traceDir, `${left[0]!.runId}.json`) },
          right: { scenarioId: right[0]!.scenarioId, branch: keys[j], runId: right[0]!.runId, path: resolve(traceDir, `${right[0]!.runId}.json`) },
          assessment,
        });
      }
    }
  }
  return results;
}

async function main() {
  await mkdir(traceDir, { recursive: true });
  const execution = await resolveCampaignExecution({ baseUrl });
  const summary = await runPlaythroughBatchV3({
    scenarioIds: [...scenarioIds],
    personas: ["speedrunner", "explorer"],
    personasByScenario: {
      "choice-shadow-attack": ["explorer"],
      "choice-shadow-recon": ["explorer"],
      "forge-service-quote-only": ["explorer"],
      "forge-service-execute": ["explorer"],
      "profession-trial-delivery-observe": ["speedrunner"],
      "profession-trial-delivery-commit": ["speedrunner"],
    },
    runsPerPersona: 1,
    maxStepsPerRun: 8,
    baseSeed: 20260716,
    mockMode: execution.mode !== "live",
    baseUrl: execution.baseUrl,
    useLivePlayerAgent: false,
    runNarrativeJudge: false,
    softlockThreshold: 6,
    stepTimeoutMs: 120000,
    traceOutputDir: traceDir,
    enableFailureClustering: true,
    scenarioSuccessPredicate: ({ scenario, state, stepIndex }) => {
      if (scenario.id === "forge-service-quote-only") {
        return stepIndex >= 0
          && state.weaponStability === 55
          && state.weaponContamination === 8
          && state.originium === 6
          && state.equippedWeapon === "WPN-3F-IRON-PIPE";
      }

      if (scenario.id === "forge-service-execute") {
        return state.originium < 6 || state.weaponStability !== 55;
      }

      if (scenario.id === "profession-trial-delivery-observe") {
        return (
          stepIndex >= 1
          && state.profession == null
          && state.completedTaskIds.includes("prof_trial_lampkeeper") === false
          && state.activeTaskIds.includes("prof_trial_lampkeeper")
        );
      }

      if (scenario.id === "profession-trial-delivery-commit") {
        return state.completedTaskIds.includes("prof_trial_lampkeeper") || state.profession === "守灯人";
      }

      if (scenario.id === "choice-shadow-recon") {
        return stepIndex === 0;
      }

      return false;
    },
  });

  const traces = await loadTraces();
  const pairs = buildCounterfactualPairs(traces);
  const scenarioByRunId = new Map(traces.map((trace) => [trace.runId, trace.scenarioId]));
  const pairArtifacts = pairs.map((pair, index) => {
    const outPath = resolve(outDir, `counterfactual-assessment-${String(index + 1).padStart(2, "0")}.json`);
    const record = {
      generatedAt: new Date().toISOString(),
      counterfactualGroup: pair.group,
      left: pair.left,
      right: pair.right,
      assessment: pair.assessment,
    };
    return { ...record, outPath };
  });

  await Promise.all(pairArtifacts.map((item) => writeFile(item.outPath, JSON.stringify(item, null, 2), "utf8")));

  const expectedGroups = new Set<string>([
    "shadow_engagement_v1",
    "forge_quote_execute_v1",
    "profession_trial_delivery_v1",
  ]);
  const observedGroups = new Set(pairs.map((pair) => pair.group));
  const meaningfulPairs = pairs.filter((pair) => pair.assessment.meaningfulChoice);
  const compact = {
    runId,
    baseUrl,
    executionMode: execution.mode,
    executionModeReason: execution.reason,
    probeLatencyMs: execution.probeLatencyMs,
    scenarioIds,
    totalRuns: summary.totalRuns,
    passedRuns: summary.passedRuns,
    failedRuns: summary.failedRuns,
    passRate: summary.passRate,
    byTermination: summary.byTermination,
    topViolations: summary.topViolations,
    failureClusters: summary.failureClusters,
    counterfactualAssessments: pairArtifacts.map((item) => ({
      group: item.counterfactualGroup,
      branches: [item.left.branch, item.right.branch],
      leftScenario: item.left.scenarioId,
      rightScenario: item.right.scenarioId,
      meaningfulChoice: item.assessment.meaningfulChoice,
      reasons: item.assessment.reasons,
    })),
    counterfactualSummary: {
      total: pairs.length,
      meaningful: meaningfulPairs.length,
      observedGroups: [...observedGroups],
      missingGroups: [...expectedGroups].filter((group) => !observedGroups.has(group)),
      nonMeaningful: pairs.filter((pair) => !pair.assessment.meaningfulChoice).map((pair) => pair.group),
    },
    runs: summary.results.map((result) => ({
      runId: result.transcript.runId,
      scenarioId: scenarioByRunId.get(result.transcript.runId) ?? "unknown",
      passed: result.passed,
      terminatedReason: result.transcript.terminatedReason,
      totalSteps: result.transcript.totalSteps,
      finalState: result.transcript.finalState,
      failureSummary: result.failureSummary,
    })),
  };
  await writeFile(resolve(outDir, "summary.json"), JSON.stringify(compact, null, 2), "utf8");
  console.log(JSON.stringify(compact, null, 2));

  const shouldFail = summary.failedRuns > 0
    || pairs.length === 0
    || [...expectedGroups].some((group) => !observedGroups.has(group))
    || meaningfulPairs.length !== pairs.length;

  if (shouldFail) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
