#!/usr/bin/env tsx
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildProductQualityScorecard, percentile } from "../src/lib/evals/productQuality/scorecard";
import type { ProductQualitySignals } from "../src/lib/evals/productQuality/types";
import { featureDecision, featureDecisionWithConfidence, type FeatureId } from "../src/lib/evals/productQuality/adaptivePlanner";
import { judgeNarrativeConsistencyCodex } from "../src/lib/evals/playthrough/narrativeJudge";
import { SCENARIOS } from "../src/lib/evals/playthrough/scenarios";
import type { PlaythroughTranscript } from "../src/lib/evals/playthrough/types";
import { assessSubjectivePlayabilityProxy, type SubjectivePlayabilityAssessment } from "../src/lib/evals/productQuality/subjectivePlayability";
import { assessJudgeEligibility, classifyRunEvidence, hasRequiredDmFields, type EvalJudgeMode, type RunEvidenceStatus } from "../src/lib/evals/productQuality/runOutcome";
import { traceContentFingerprint } from "../src/lib/evals/productQuality/traceIdentity";
import { classifyBugCohort } from "../src/lib/evals/productQuality/bugCohort";
import type { RunFailureContext } from "../src/lib/evals/playthrough/types";

type Json = Record<string, unknown>;
type JudgeMode = "live" | "codex" | "mock" | "fallback" | "unknown";
type JudgeConfidenceSource = "model" | "codex" | "mock" | "fallback" | "estimated";
interface JudgeComparison {
  mockOverall?: number;
  mockPassed?: boolean;
  liveAvailable?: boolean;
  liveOverall?: number;
  livePassed?: boolean;
  passAgreement?: boolean;
  scoreGap?: number;
  criticalGap?: number;
  majorGap?: number;
}
const args = process.argv.slice(2);
const value = (name: string, fallback: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] ?? fallback : fallback; };
const inputDirs = value("--input", ".runtime-data/eval").split(",").map((p) => resolve(p));
const currentInputDirs = value("--current-input", "").split(",").map((p) => p.trim()).filter(Boolean).map((p) => resolve(p));
const output = resolve(value("--out", ".runtime-data/eval/product-quality-report.json"));
const markdownOutput = resolve(value("--md-out", output.replace(/\.json$/i, ".md")));
const humanResultPaths = value("--human-results", "").split(",").map((item) => item.trim()).filter(Boolean).map((item) => resolve(item));
const counterfactualResultPaths = value("--counterfactual-results", "").split(",").map((item) => item.trim()).filter(Boolean).map((item) => resolve(item));

const judgeConfidenceSourceReliability: Record<JudgeConfidenceSource, number> = {
  model: 1,
  codex: 0.95,
  mock: 0.6,
  fallback: 0.5,
  estimated: 0.3,
};
const zFromConfidenceLevel = (confidenceLevel: number): number => confidenceLevel === 0.99 ? 2.576 : 1.96;

type FailureClassification = {
  fingerprint: string;
  severity: "critical" | "major" | "minor";
  status: "confirmed" | "needs_triage" | "expected_guard_hit";
  evidence: string;
};

type FeatureDecisionReport = {
  touchedTurns: number;
  progressionTurns: number;
  contributionRate: number | null;
  decision: ReturnType<typeof featureDecision>;
  confidence: number;
  interval: { lower: number; upper: number } | null;
  rationale: string[];
  evidenceLabel: "missing" | "weak" | "moderate" | "strong";
  judgeReliability: number | null;
};

type BugRiskSummary = {
  totalRows: number;
  totalActionableBugs: number;
  criticalActionableBugs: number;
  majorActionableBugs: number;
  minorActionableBugs: number;
  guardObservedRowsCurrent: number;
  reproducedRowsCurrent: number;
  topActionableFingerprints: string[];
  actionableRatePer100Turns: number | null;
};

const FEATURE_IDS: FeatureId[] = ["tasks", "weapons", "combat", "codex", "economy", "profession", "location"];

function normalizeFailureReason(raw: unknown): string {
  return String(raw ?? "").toLowerCase().trim();
}

function classifyRuntimeFailure(args: {
  action?: string;
  reason?: string;
  transportStatus?: string;
  aiStatus?: string;
  hasVisibleNarrative?: boolean;
  stepFailureMode?: string;
}): FailureClassification {
  const action = normalizeFailureReason(args.action);
  const reason = normalizeFailureReason(args.reason);
  const aiStatus = normalizeFailureReason(args.aiStatus);
  const transportStatus = normalizeFailureReason(args.transportStatus);
  const evidence = `action=${action || "unknown"}; reason=${reason || "unknown"}; transport=${transportStatus || "unknown"}; aiStatus=${aiStatus || "unknown"}; mode=${args.stepFailureMode || "unknown"}`;
  if (action === "internal_no_visible_fallback" || reason.includes("server_internal_non_visible") || reason.includes("non_visible")) {
    return {
      fingerprint: "runtime:degraded_empty_or_invisible_narrative",
      severity: "major",
      status: "confirmed",
      evidence,
    };
  }
  if (reason === "server_internal_generation_failed" || reason.includes("server_internal")) {
    return {
      fingerprint: "dependency:site_fallback_generation_failed",
      severity: args.hasVisibleNarrative ? "major" : "critical",
      status: "confirmed",
      evidence: args.hasVisibleNarrative ? evidence : `${evidence}; visibleNarrative=${args.hasVisibleNarrative}`,
    };
  }
  if (reason.startsWith("ai_router:")) {
    if (reason.includes("429") || reason.includes("rate_limit")) {
      return {
        fingerprint: "dependency:ai_router_rate_limited",
        severity: "minor",
        status: "needs_triage",
        evidence,
      };
    }
    if (reason.includes("aborted") || reason.includes("timeout")) {
      return {
        fingerprint: "dependency:ai_router_timeout",
        severity: "major",
        status: "confirmed",
        evidence,
      };
    }
    if (reason.includes("unauthorized") || reason.includes("invalid")) {
      return {
        fingerprint: "dependency:ai_router_auth_or_key",
        severity: "critical",
        status: "needs_triage",
        evidence,
      };
    }
    return {
      fingerprint: "dependency:live_generation_unavailable",
      severity: "minor",
      status: "confirmed",
      evidence,
    };
  }
  if (reason === "keys_missing" || reason.includes("keys_missing")) {
    return {
      fingerprint: "dependency:ai_gateway_missing_config",
      severity: "minor",
      status: "confirmed",
      evidence,
    };
  }
  if (reason || aiStatus || transportStatus) {
    if (args.stepFailureMode === "step_degraded" || transportStatus === "degraded") {
      return {
        fingerprint: "runtime:stream_or_transport_degraded",
        severity: "major",
        status: "needs_triage",
        evidence,
      };
    }
    return {
      fingerprint: "runtime:unclassified_live_runtime_error",
      severity: "major",
      status: "needs_triage",
      evidence,
    };
  }
  if (transportStatus === "degraded") {
    return {
      fingerprint: "runtime:stream_or_transport_degraded",
      severity: "major",
      status: "needs_triage",
      evidence,
    };
  }
  return {
    fingerprint: args.stepFailureMode === "softlock"
      ? "runtime:softlock_without_structured_context"
      : "runtime:unclassified_live_runtime_failure",
    severity: "major",
    status: "needs_triage",
    evidence,
  };
}

function parseFailureContextField(raw: unknown): RunFailureContext | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const ctx = raw as Record<string, unknown>;
  return {
    stepIndex: typeof ctx.stepIndex === "number" ? ctx.stepIndex : undefined,
    action: typeof ctx.action === "string" ? ctx.action : undefined,
    reason: typeof ctx.reason === "string" ? ctx.reason : undefined,
    transportStatus: typeof ctx.transportStatus === "string" ? ctx.transportStatus : undefined,
    aiStatus: typeof ctx.aiStatus === "string" ? ctx.aiStatus : undefined,
    hasVisibleNarrative: typeof ctx.hasVisibleNarrative === "boolean" ? ctx.hasVisibleNarrative : undefined,
    stepFailureMode: typeof ctx.stepFailureMode === "string" ? ctx.stepFailureMode : undefined,
  };
}

function extractRuntimeFailureContext(run: Json, steps: Json[]): RunFailureContext {
  const runTopContext = parseFailureContextField(run.failureContext);
  if (runTopContext && (runTopContext.reason || runTopContext.action || runTopContext.transportStatus || runTopContext.aiStatus || runTopContext.stepFailureMode)) {
    return runTopContext;
  }

  const fallbackStep = steps.find((candidate) => {
    const dm = (candidate.dmJson as Json | undefined) ?? {};
    const transport = (candidate.transport as Json | undefined) ?? {};
    const transportStatus = typeof transport.status === "string" ? transport.status : undefined;
    return transportStatus === "error"
      || transportStatus === "degraded"
      || (typeof dm.internal_meta === "object" && dm.internal_meta !== null && !Array.isArray(dm.internal_meta));
  });
  if (fallbackStep) {
    const dm = (fallbackStep.dmJson as Json | undefined) ?? {};
    const transport = (fallbackStep.transport as Json | undefined) ?? {};
    const internalMeta = dm.internal_meta && typeof dm.internal_meta === "object" && !Array.isArray(dm.internal_meta)
      ? dm.internal_meta as Record<string, unknown>
      : null;
    const reason = typeof internalMeta?.reason === "string" ? internalMeta.reason : undefined;
    const action = typeof internalMeta?.action === "string" ? internalMeta.action : undefined;
    const narrative = typeof fallbackStep.narrative === "string" ? fallbackStep.narrative : "";
    return {
      stepIndex: typeof fallbackStep.stepIndex === "number" ? fallbackStep.stepIndex : undefined,
      action: String(fallbackStep.playerAction ?? action ?? "unknown"),
      reason: reason ?? "unknown",
      transportStatus: typeof transport.status === "string" ? transport.status : undefined,
      aiStatus: typeof transport.aiStatus === "string" ? transport.aiStatus : undefined,
      hasVisibleNarrative: narrative.trim().length > 0,
      stepFailureMode: typeof transport.status === "string" && transport.status === "error"
        ? "step_error"
        : "step_degraded",
    };
  }

  return {
    action: "unknown",
    reason: String(run.terminatedReason ?? "unknown"),
    transportStatus: typeof run.executionMode === "string" ? String(run.executionMode).replace("live_", "") : undefined,
    aiStatus: undefined,
    hasVisibleNarrative: false,
    stepFailureMode: run.terminatedReason === "softlock" ? "softlock" : "run_terminal_error",
  };
}

function wilsonInterval(successes: number, trials: number, confidenceLevel = 0.95): { lower: number; upper: number } | null {
  if (!Number.isFinite(successes) || !Number.isFinite(trials) || trials <= 0) return null;
  const p = clamp01(successes / trials);
  const z = zFromConfidenceLevel(confidenceLevel);
  const z2 = z ** 2;
  const denominator = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * trials)) / trials) / denominator;
  return {
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
  };
}

function normalizeJudgeMode(raw: unknown): JudgeMode {
  if (raw === "live" || raw === "codex" || raw === "mock" || raw === "fallback") return raw;
  return "unknown";
}

function normalizeJudgeConfidenceSource(raw: unknown): JudgeConfidenceSource | null {
  if (raw === "model" || raw === "codex" || raw === "mock" || raw === "fallback" || raw === "estimated") return raw;
  return null;
}

function normalizeJudgeConfidence(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const value = raw;
  if (value < 0 || value > 1) return null;
  return clamp01(value);
}

function deriveJudgeConfidence(consistency: Json): number | null {
  const direct = normalizeJudgeConfidence(consistency?.judgeConfidence as unknown);
  if (direct !== null) return direct;
  return null;
}

function judgeConfidenceFromRun(consistency: Json | undefined): number | null {
  if (!consistency || typeof consistency !== "object" || Array.isArray(consistency)) return null;
  return deriveJudgeConfidence(consistency);
}

function judgeConfidenceSourceForRun(consistency: Json | undefined, judgeMode: JudgeMode): JudgeConfidenceSource {
  const source = normalizeJudgeConfidenceSource(consistency?.judgeConfidenceSource)
    ?? normalizeJudgeConfidenceSource(consistency?.judgeMode);
  if (source) return source;
  if (judgeMode === "live") return "model";
  if (judgeMode === "codex") return "codex";
  if (judgeMode === "fallback") return "fallback";
  if (judgeMode === "mock") return "mock";
  return "estimated";
}

function inferJudgeMode(run: Json, consistency: Json | undefined): JudgeMode {
  const direct = normalizeJudgeMode(run.judgeMode);
  if (direct !== "unknown") return direct;
  if (typeof consistency?.judgeMode === "string") return normalizeJudgeMode(consistency.judgeMode);
  if (typeof consistency?.judgeModel === "string") {
    const judgeModel = consistency.judgeModel.toLowerCase();
    if (judgeModel.includes("heuristic_codex")) return "codex";
    if (judgeModel.includes("heuristic")) return "mock";
  }
  if (typeof run.narrativeConsistency === "string") return "unknown";
  return "unknown";
}

function estimatePassConfidence(passRate: number, runs: number, confidenceLevel = 0.95): number {
  if (!Number.isFinite(passRate) || runs <= 0) return 0;
  const p = clamp01(passRate);
  const successes = Math.max(0, Math.min(runs, Math.round(p * runs)));
  const interval = wilsonInterval(successes, runs, confidenceLevel);
  return interval?.lower ?? 0;
}

function scoreStabilityConf(scores: number[]): number {
  if (scores.length <= 1) return 0.7;
  const finite = scores.filter(Number.isFinite);
  if (finite.length <= 1) return 0.6;
  const avg = finite.reduce((sum, score) => sum + score, 0) / finite.length;
  const variance = finite.reduce((sum, score) => sum + (score - avg) ** 2, 0) / finite.length;
  const std = Math.sqrt(variance);
  return Math.max(0, Math.min(1, 1 - std / 2.4));
}

function normalizeJudgeComparison(raw: unknown): JudgeComparison | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  return {
    mockOverall: typeof data.mockOverall === "number" && Number.isFinite(data.mockOverall) ? data.mockOverall : undefined,
    mockPassed: typeof data.mockPassed === "boolean" ? data.mockPassed : undefined,
    liveAvailable: data.liveAvailable === true,
    liveOverall: typeof data.liveOverall === "number" && Number.isFinite(data.liveOverall) ? data.liveOverall : undefined,
    livePassed: typeof data.livePassed === "boolean" ? data.livePassed : undefined,
    passAgreement: typeof data.passAgreement === "boolean" ? data.passAgreement : undefined,
    scoreGap: typeof data.scoreGap === "number" && Number.isFinite(data.scoreGap) ? Math.abs(data.scoreGap) : undefined,
    criticalGap: typeof data.criticalGap === "number" && Number.isFinite(data.criticalGap) ? data.criticalGap : undefined,
    majorGap: typeof data.majorGap === "number" && Number.isFinite(data.majorGap) ? data.majorGap : undefined,
  };
}

interface CodexJudgeAlignment {
  baselineScore: number;
  codexScore: number;
  baselinePassed: boolean;
  codexPassed: boolean;
  scoreGap: number;
  agrees: boolean;
  adjustedScore: number;
  adjustedPassed: boolean;
  agreementSeverity: "none" | "minor" | "major" | "critical";
}

function alignJudgeWithCodex(args: {
  judgeMode: JudgeMode;
  baselineScore: number;
  baselinePassed: boolean;
  codexJudge: ReturnType<typeof judgeNarrativeConsistencyCodex>;
}): CodexJudgeAlignment {
  const codexScore = clampScore(args.codexJudge.overallScore);
  const codexPassed = args.codexJudge.passed === true;
  const scoreGap = Math.abs(args.baselineScore - codexScore);
  const agrees = args.baselinePassed === codexPassed;
  const needsDowngrade = args.judgeMode !== "live" && args.judgeMode !== "codex";

  if (!needsDowngrade) {
    return {
      baselineScore: args.baselineScore,
      codexScore,
      baselinePassed: args.baselinePassed,
      codexPassed,
      scoreGap,
      agrees,
      adjustedScore: args.baselineScore,
      adjustedPassed: args.baselinePassed,
      agreementSeverity: scoreGap >= 1.4 ? "critical" : scoreGap >= 0.9 ? "major" : scoreGap >= 0.4 ? "minor" : "none",
    };
  }

  const blendedScore = 0.4 * args.baselineScore + 0.6 * codexScore;
  const adjustedScore = clampScore(Math.min(blendedScore, Math.max(args.baselineScore, codexScore) * 0.95));
  const agreementSeverity = scoreGap >= 1.4 ? "critical" : scoreGap >= 0.9 ? "major" : scoreGap >= 0.4 ? "minor" : "none";

  return {
    baselineScore: args.baselineScore,
    codexScore,
    baselinePassed: args.baselinePassed,
    codexPassed,
    scoreGap,
    agrees,
    adjustedScore,
    adjustedPassed: codexPassed && adjustedScore >= 3,
    agreementSeverity,
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
function clampScore(value: number): number {
  return Math.max(1, Math.min(5, value));
}

function repetitionRateFromSteps(steps: Json[]): number | null {
  const units = steps.flatMap((step) => String(step.narrative ?? "")
    .split(/[。！？\n]+/)
    .map((text) => text.replace(/\s+/g, "").trim())
    .filter((text) => text.length >= 12));
  if (units.length === 0) return null;
  const seen = new Set<string>();
  let repeats = 0;
  for (const unit of units) {
    const fingerprint = unit.slice(0, 48);
    if (seen.has(fingerprint)) repeats += 1;
    else seen.add(fingerprint);
  }
  return repeats / units.length;
}

function toTranscript(run: Json, steps: Json[]): PlaythroughTranscript {
  const normalizeState = (stateLike: Json | undefined): Json => {
    const raw = stateLike ?? {};
    return {
      playerLocation: String(raw.playerLocation ?? ""),
      hp: Number(raw.hp ?? 0),
      sanity: Number(raw.sanity ?? 0),
      activeTaskIds: Array.isArray(raw.activeTaskIds) ? raw.activeTaskIds : [],
      completedTaskIds: Array.isArray(raw.completedTaskIds) ? raw.completedTaskIds : [],
      equippedWeapon: String(raw.equippedWeapon ?? ""),
      inventoryItemCount: Number(raw.inventoryItemCount ?? 0),
      turnCount: Number(raw.turnCount ?? 0),
      chapterNumber: Number(raw.chapterNumber ?? 0),
      isDeath: Boolean(raw.isDeath ?? false),
      reachedEnding: Boolean(raw.reachedEnding ?? false),
      unlockedFlags: Array.isArray(raw.unlockedFlags) ? raw.unlockedFlags : [],
      profession: raw.profession ?? null,
      weaponBag: Array.isArray(raw.weaponBag) ? raw.weaponBag : undefined,
      inventoryItemIds: Array.isArray(raw.inventoryItemIds) ? raw.inventoryItemIds : [],
      maxInventorySlots: Number(raw.maxInventorySlots ?? 0),
      originium: Number(raw.originium ?? 0),
      currentFloor: String(raw.currentFloor ?? ""),
      codexNpcIds: Array.isArray(raw.codexNpcIds) ? raw.codexNpcIds : [],
      aliveNpcIds: Array.isArray(raw.aliveNpcIds) ? raw.aliveNpcIds : [],
      deadNpcIds: Array.isArray(raw.deadNpcIds) ? raw.deadNpcIds : [],
      weaponContamination: Number(raw.weaponContamination ?? 0),
      weaponStability: Number(raw.weaponStability ?? 0),
      presentNpcIds: Array.isArray(raw.presentNpcIds) ? raw.presentNpcIds : [],
      journalClueIds: Array.isArray(raw.journalClueIds) ? raw.journalClueIds : [],
      activeThreatIds: Array.isArray(raw.activeThreatIds) ? raw.activeThreatIds : [],
    } as Json;
  };
  let previousState: Json = normalizeState(run.initialState as Json | undefined);
  const safeSteps = Array.isArray(steps) ? steps : [];
  const normalizedSteps: Array<Json> = [];
  for (let index = 0; index < safeSteps.length; index += 1) {
    const step = safeSteps[index] ?? {};
    const stateRaw = (step.stateSnapshot as Json | undefined) ?? (step.stateAfter as Json | undefined);
    const stateAfter = stateRaw ? normalizeState(stateRaw) : previousState;
    previousState = stateAfter;
    normalizedSteps.push({
      stepIndex: Number(step.stepIndex ?? index),
      playerAction: String(step.playerAction ?? ""),
      narrative: String(step.narrative ?? ""),
      dmJson: (step.dmJson as Json | undefined) ?? {},
      stateAfter,
      metrics: step.metrics as Json | undefined,
      timestamp: index,
    });
  }
  return {
    runId: String(run.runId), persona: String(run.persona ?? "explorer"), seed: Number(run.seed ?? 0),
    steps: normalizedSteps as unknown as PlaythroughTranscript["steps"],
    initialState: normalizeState(run.initialState as Json | undefined),
    finalState: previousState,
    terminatedReason: run.terminatedReason ?? "max_steps",
    totalSteps: safeSteps.length,
    durationMs: Number(run.durationMs ?? 0),
  } as unknown as PlaythroughTranscript;
}

async function jsonFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function visit(path: string): Promise<void> {
    for (const entry of await readdir(path, { withFileTypes: true }).catch(() => [])) {
      const child = resolve(path, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (entry.name.endsWith(".json") && entry.name !== "summary.json") out.push(child);
    }
  }
  await visit(root);
  return out;
}

async function main(): Promise<void> {
const records: Json[] = [];
const seenTraceFingerprints = new Set<string>();
let duplicateArtifactCount = 0;
for (const { dir, cohort } of [
  ...currentInputDirs.map((dir) => ({ dir, cohort: "current" as const })),
  ...inputDirs.map((dir) => ({ dir, cohort: "baseline" as const })),
]) {
  for (const file of await jsonFiles(dir)) {
    try {
      const parsed = JSON.parse(await readFile(file, "utf8")) as Json;
      if (Array.isArray(parsed.steps) && typeof parsed.runId === "string") {
        const traceFingerprint = traceContentFingerprint(parsed);
        if (seenTraceFingerprints.has(traceFingerprint)) {
          duplicateArtifactCount += 1;
          continue;
        }
        seenTraceFingerprints.add(traceFingerprint);
        parsed.__evidenceCohort = cohort;
        records.push(parsed);
      }
    } catch { /* unrelated or partial artifact */ }
  }
}

const latencies: number[] = [];
const narrativeScores: number[] = [];
const repetitionRates: number[] = [];
const subjectiveAssessments: SubjectivePlayabilityAssessment[] = [];
let subjectiveEligibleRuns = 0;
let turns = 0;
let progressionTurns = 0;
let choiceTurns = 0;
let meaningfulChoiceTurns = 0;
let scoreableAgencyTurns = 0;
let responsiveAgencyTurns = 0;
let structuredConsequenceTurns = 0;
let deadTurns = 0;
let consequenceOpportunityTurns = 0;
let worldConsistencyIssueTurns = 0;
let tokenCoveredTurns = 0;
let tokenInput = 0;
let tokenOutput = 0;
let tokenCachedInput = 0;
const promptComponentTotals: Record<string, { chars: number; samples: number }> = {};
const featureSignals: Record<string, { touchedTurns: number; progressionTurns: number }> = Object.fromEntries(
  FEATURE_IDS.map((id) => [id, { touchedTurns: 0, progressionTurns: 0 }]),
);
type FeatureJudgeSignal = { weightSum: number; touchSamples: number; progressionWeightSum: number; progressionSamples: number };
const featureJudgeSignals: Record<string, FeatureJudgeSignal> = Object.fromEntries(
  FEATURE_IDS.map((id) => [id, { weightSum: 0, touchSamples: 0, progressionWeightSum: 0, progressionSamples: 0 }]),
);
type BugRow = { fingerprint: string; category: string; severity: "critical" | "major" | "minor"; status: "confirmed" | "needs_triage" | "expected_guard_hit"; count: number; baselineCount: number; currentCount: number; currentActionableCount: number; runIds: string[]; currentRunIds: string[]; evidence: string[] };
const bugLedger = new Map<string, BugRow>();
const turnDiagnostics: Array<{ runId: string; stepIndex: number | string; action: string; flags: string[]; inputTokens: number | null; outputTokens: number | null; cachedInputTokens: number | null; costEquivalentTokens: number | null; latencyMs: number | null }> = [];
const promptVariantRuns: Record<string, { runs: number; passed: number; degraded: number; inconclusive: number; inputTokens: number; tokenSamples: number }> = {};
const judgeModeCounts: Record<JudgeMode, { runs: number; scoreSamples: number; passes: number }> = {
  live: { runs: 0, scoreSamples: 0, passes: 0 },
  codex: { runs: 0, scoreSamples: 0, passes: 0 },
  mock: { runs: 0, scoreSamples: 0, passes: 0 },
  fallback: { runs: 0, scoreSamples: 0, passes: 0 },
  unknown: { runs: 0, scoreSamples: 0, passes: 0 },
};
const judgeComparisonStats: { runs: number; passAgreementRuns: number; passAgreement: number; scoreGapSamples: number[]; criticalGapSamples: number[]; majorGapSamples: number[]; liveAvailableRuns: number } = {
  runs: 0,
  passAgreementRuns: 0,
  passAgreement: 0,
  scoreGapSamples: [],
  criticalGapSamples: [],
  majorGapSamples: [],
  liveAvailableRuns: 0,
};
const judgeCodexAgreementStats: { total: number; agree: number; scoreGapSamples: number[] } = {
  total: 0,
  agree: 0,
  scoreGapSamples: [],
};
let judgeCoverageRuns = 0;
let judgeCoveragePasses = 0;
let judgeConfidenceSampleSum = 0;
let judgeConfidenceSampleCount = 0;
let judgeModelSampleCount = 0;
let judgeConfidenceWeightedSum = 0;
let judgeConfidenceEvidenceWeight = 0;
let judgeConfidenceTrustedSampleCount = 0;
let judgeConfidenceTrustedWeightedSum = 0;
let judgeConfidenceTrustedEvidenceWeight = 0;
const judgeConfidenceSamplesBySource: Record<JudgeConfidenceSource, number> = {
  model: 0,
  codex: 0,
  mock: 0,
  fallback: 0,
  estimated: 0,
};
let activeEvidenceCohort: "baseline" | "current" = "baseline";
const recordBug = (fingerprint: string, category: string, severity: BugRow["severity"], runId: string, evidence: string, status: BugRow["status"] = category === "validator" ? "needs_triage" : "confirmed") => {
  const row = bugLedger.get(fingerprint) ?? { fingerprint, category, severity, status, count: 0, baselineCount: 0, currentCount: 0, currentActionableCount: 0, runIds: [], currentRunIds: [], evidence: [] };
  row.count += 1;
  if (activeEvidenceCohort === "current") {
    row.currentCount += 1;
    if (status !== "expected_guard_hit") row.currentActionableCount += 1;
    if (!row.currentRunIds.includes(runId)) row.currentRunIds.push(runId);
  } else row.baselineCount += 1;
  if (!row.runIds.includes(runId)) row.runIds.push(runId);
  if (row.evidence.length < 3) row.evidence.push(evidence.slice(0, 240));
  bugLedger.set(fingerprint, row);
};

function summarizeBugRisk(args: { rows: BugRow[]; turns: number }): BugRiskSummary {
  const rows = args.rows.map((row) => ({ ...row, cohortDisposition: classifyBugCohort(row) }));
  const safeRate = (value: number | null): number | null => (Number.isFinite(value) ? Math.max(0, value) : null);
  const totalActionableBugs = rows.reduce((total, row) => total + (row.currentActionableCount > 0 ? row.currentActionableCount : 0), 0);
  const criticalActionableBugs = rows.reduce(
    (total, row) => total + (row.severity === "critical" ? row.currentActionableCount : 0),
    0,
  );
  const majorActionableBugs = rows.reduce(
    (total, row) => total + (row.severity === "major" ? row.currentActionableCount : 0),
    0,
  );
  const minorActionableBugs = rows.reduce(
    (total, row) => total + (row.severity === "minor" ? row.currentActionableCount : 0),
    0,
  );
  const reproducedRowsCurrent = rows.filter((row) => row.cohortDisposition === "reproduced_current").length;
  const guardObservedRowsCurrent = rows.filter((row) => row.cohortDisposition === "guard_observed_current").length;
  const topActionableFingerprints = rows
    .filter((row) => row.currentActionableCount > 0)
    .sort((a, b) => b.currentActionableCount - a.currentActionableCount)
    .slice(0, 5)
    .map((row) => `${row.fingerprint}(${row.currentActionableCount})`);
  const actionableRatePer100Turns = args.turns > 0 ? (totalActionableBugs / args.turns) * 100 : null;

  return {
    totalRows: rows.length,
    totalActionableBugs,
    criticalActionableBugs,
    majorActionableBugs,
    minorActionableBugs,
    reproducedRowsCurrent,
    guardObservedRowsCurrent,
    topActionableFingerprints,
    actionableRatePer100Turns: safeRate(actionableRatePer100Turns),
  };
}

const evidenceStatus = (run: Json): RunEvidenceStatus => {
  if (run.evidenceStatus === "pass" || run.evidenceStatus === "fail" || run.evidenceStatus === "inconclusive" || run.evidenceStatus === "infrastructure_failure") return run.evidenceStatus;
  const scenario = SCENARIOS.find((candidate) => candidate.id === run.scenarioId);
  const steps = Array.isArray(run.steps) ? run.steps : [];
  const judge = run.narrativeConsistency && typeof run.narrativeConsistency === "object" && !Array.isArray(run.narrativeConsistency) ? run.narrativeConsistency as Json : {};
  const gate = run.gameplayGate && typeof run.gameplayGate === "object" && !Array.isArray(run.gameplayGate) ? run.gameplayGate as Json : {};
  if (scenario?.scriptedActions?.length) {
    const executionMode = String(run.executionMode ?? "unknown");
    const terminatedReason = String(run.terminatedReason ?? "unknown");
    const degradedSteps = steps.filter((step) => (step.transport as Json | undefined)?.status === "degraded").length;
    const eligibility = assessJudgeEligibility({
      executionMode,
      terminatedReason,
      executedSteps: steps.length,
      degradedSteps,
      protocolComplete: steps.length > 0,
      requiredDmFieldsComplete: steps.length > 0 && steps.every((step) => hasRequiredDmFields((step.dmJson as Json | undefined) ?? {})),
    });
    const judgeMode = (["live", "mock", "codex", "fallback", "none"] as const).includes(run.judgeMode as EvalJudgeMode)
      ? run.judgeMode as EvalJudgeMode
      : "none";
    return classifyRunEvidence({ executionMode, terminatedReason, judgePassed: typeof judge.passed === "boolean" ? judge.passed : null, judgeMode, gameplayGatePassed: gate.passed === true, executedSteps: steps.length, plannedScenarioSteps: scenario.scriptedActions.length, eligibility });
  }
  return !Array.isArray(run.failureTags) || run.failureTags.length === 0 ? "pass" : "fail";
};

for (const run of records) {
  activeEvidenceCohort = run.__evidenceCohort === "current" ? "current" : "baseline";
  const runId = String(run.runId);
  const steps = run.steps as Json[];
  const firstDm = (steps[0]?.dmJson as Json | undefined) ?? {};
  const firstEval = firstDm._eval_metrics && typeof firstDm._eval_metrics === "object" && !Array.isArray(firstDm._eval_metrics) ? firstDm._eval_metrics as Json : {};
  const firstComponents = firstEval.prompt_component_chars && typeof firstEval.prompt_component_chars === "object" && !Array.isArray(firstEval.prompt_component_chars) ? firstEval.prompt_component_chars as Json : {};
  const consistency = run.narrativeConsistency && typeof run.narrativeConsistency === "object" && !Array.isArray(run.narrativeConsistency)
    ? run.narrativeConsistency as Json
    : {};
  const judgeMode = inferJudgeMode(run, consistency);
  const runModeStats = judgeModeCounts[judgeMode];
  const runJudgeConfidenceSource = judgeConfidenceSourceForRun(consistency, judgeMode);
  const runJudgeConfidence = judgeConfidenceFromRun(consistency);
  const judgeComparison = normalizeJudgeComparison(run.judgeComparison);
  const stableChars = typeof firstComponents.stable_prefix === "number" ? firstComponents.stable_prefix : null;
  const runtimeChars = typeof firstComponents.runtime_packets === "number" ? firstComponents.runtime_packets : null;
  const stableVariant = stableChars === null ? "unknown_stable" : stableChars < 2_000 ? "compact_stable" : "full_stable";
  const runtimeVariant = runtimeChars === null ? "unknown_runtime" : runtimeChars <= 3_300 ? "runtime_3200" : "runtime_4000";
  const promptVariant = `${stableVariant}/${runtimeVariant}`;
  const variantRow = promptVariantRuns[promptVariant] ?? { runs: 0, passed: 0, degraded: 0, inconclusive: 0, inputTokens: 0, tokenSamples: 0 };
  variantRow.runs += 1;
  const runDegraded = run.executionMode === "live_degraded" || run.terminatedReason === "error";
  const runStatus = evidenceStatus(run);
  if (runStatus !== "inconclusive") runModeStats.runs += 1;
  if (runDegraded) variantRow.degraded += 1;
  if (runStatus === "pass") variantRow.passed += 1;
  if (runStatus === "inconclusive") variantRow.inconclusive += 1;
  if (typeof firstEval.input_tokens === "number") { variantRow.inputTokens += firstEval.input_tokens; variantRow.tokenSamples += 1; }
  promptVariantRuns[promptVariant] = variantRow;
  if (runJudgeConfidence !== null) {
    judgeConfidenceSampleSum += runJudgeConfidence;
    judgeConfidenceSampleCount += 1;
    judgeConfidenceSamplesBySource[runJudgeConfidenceSource] += 1;
    const sourceReliability = judgeConfidenceSourceReliability[runJudgeConfidenceSource];
    judgeConfidenceWeightedSum += runJudgeConfidence * sourceReliability;
    judgeConfidenceEvidenceWeight += sourceReliability;
    if (runJudgeConfidenceSource === "model" || runJudgeConfidenceSource === "codex") {
      judgeConfidenceTrustedSampleCount += 1;
      judgeConfidenceTrustedWeightedSum += runJudgeConfidence * sourceReliability;
      judgeConfidenceTrustedEvidenceWeight += sourceReliability;
    }
    if (runJudgeConfidenceSource === "model") judgeModelSampleCount += 1;
  }
  const hasStepJudgeEvidence = runJudgeConfidence !== null;
  const baseStepJudgeConfidence = hasStepJudgeEvidence ? runJudgeConfidence : 0;
  const judgePenalty = runDegraded ? 0.35 : 1;
  const stepJudgeConfidence = clamp01((Number.isFinite(baseStepJudgeConfidence) ? baseStepJudgeConfidence : 0) * judgePenalty);
  let previous = (run.initialState as Json | undefined) ?? {};
  for (const step of steps) {
    turns += 1;
    const metrics = (step.metrics as Json | undefined) ?? {};
    const dm = (step.dmJson as Json | undefined) ?? {};
    const evalMetrics = (dm._eval_metrics && typeof dm._eval_metrics === "object" && !Array.isArray(dm._eval_metrics) ? dm._eval_metrics : {}) as Json;
    const latency = typeof metrics.latencyMs === "number" ? metrics.latencyMs : typeof step.latencyMs === "number" ? step.latencyMs : null;
    if (latency !== null) latencies.push(latency);
    const input = typeof metrics.inputTokens === "number" ? metrics.inputTokens : typeof evalMetrics.input_tokens === "number" ? evalMetrics.input_tokens : null;
    const outputTokens = typeof metrics.outputTokens === "number" ? metrics.outputTokens : typeof evalMetrics.output_tokens === "number" ? evalMetrics.output_tokens : null;
    const cachedInputTokens = typeof metrics.cachedInputTokens === "number"
      ? metrics.cachedInputTokens
      : typeof evalMetrics.cached_input_tokens === "number" ? evalMetrics.cached_input_tokens : null;
    const costEquivalentTokens = input !== null && outputTokens !== null && cachedInputTokens !== null
      ? Math.max(0, input - cachedInputTokens) + cachedInputTokens * 0.02 + outputTokens * 2
      : null;
    if (input !== null && outputTokens !== null) { tokenCoveredTurns += 1; tokenInput += input; tokenOutput += outputTokens; }
    if (typeof evalMetrics.cached_input_tokens === "number") tokenCachedInput += evalMetrics.cached_input_tokens;
    if (evalMetrics.prompt_component_chars && typeof evalMetrics.prompt_component_chars === "object" && !Array.isArray(evalMetrics.prompt_component_chars)) {
      for (const [id, chars] of Object.entries(evalMetrics.prompt_component_chars as Json)) {
        if (typeof chars !== "number" || !Number.isFinite(chars)) continue;
        const row = promptComponentTotals[id] ?? { chars: 0, samples: 0 };
        row.chars += chars; row.samples += 1; promptComponentTotals[id] = row;
      }
    }
    const state = (step.stateSnapshot as Json | undefined) ?? (step.stateAfter as Json | undefined) ?? {};
    const keys = ["playerLocation", "hp", "sanity", "originium", "profession", "equippedWeapon", "inventoryItemCount"];
    const arrays = ["activeTaskIds", "completedTaskIds", "codexNpcIds", "unlockedFlags"];
    const progressed = keys.some((key) => state[key] !== previous[key]) || arrays.some((key) => JSON.stringify(state[key]) !== JSON.stringify(previous[key]));
    if (progressed) progressionTurns += 1;
    const deltaKeys = ["new_tasks", "task_updates", "awarded_items", "awarded_warehouse_items", "consumed_items", "clue_updates", "npc_location_updates", "main_threat_updates", "weapon_updates", "weapon_bag_updates"];
    const hasStructuredDelta = deltaKeys.some((key) => Array.isArray(dm[key]) && (dm[key] as unknown[]).length > 0)
      || (typeof dm.currency_change === "number" && dm.currency_change !== 0)
      || typeof dm.player_location === "string" || dm.conflict_outcome != null || dm.profession_trial_result != null
      || (typeof dm.sanity_damage === "number" && dm.sanity_damage !== 0) || dm.is_death === true;
    const action = String(step.playerAction ?? "");
    const readOnlyIntent = /^(?:检查|查看|核对|确认|询问|观察|寻找)/.test(action);
    const mutationRequested = !readOnlyIntent && /攻击|反击|压制|交付|领取|接受|装备|卸下|锻造|修理|强化|购买|出售|交易|拾取|进入|离开|前往|移动|认证|提交/.test(action);
    const diagnosticFlags: string[] = [];
    if (mutationRequested) {
      consequenceOpportunityTurns += 1;
      const narrative = String(step.narrative ?? dm.narrative ?? "");
      const acknowledgedNoop = /已经|无需|没有可|无法|不能|不会重复|未满足|前置不足|未认证|保持|仍为|确认|不补写|不新增/.test(narrative);
      if (hasStructuredDelta || dm.is_action_legal === false || acknowledgedNoop) structuredConsequenceTurns += 1;
      else deadTurns += 1;
      if (!hasStructuredDelta && dm.is_action_legal !== false && !acknowledgedNoop) {
        diagnosticFlags.push("mutation_without_structured_or_noop_resolution");
      }
    }
    if ((input ?? 0) + (outputTokens ?? 0) >= 10_000) {
      diagnosticFlags.push("high_context_turn");
    }
    if ((costEquivalentTokens ?? 0) >= 10_000) diagnosticFlags.push("high_cost_turn");
    if (diagnosticFlags.length > 0) turnDiagnostics.push({ runId, stepIndex: typeof step.stepIndex === "number" ? step.stepIndex : "?", action: action.slice(0, 160), flags: diagnosticFlags, inputTokens: input, outputTokens, cachedInputTokens, costEquivalentTokens, latencyMs: latency });
    const executionMode = String(run.executionMode ?? "live_full");
    if (executionMode !== "live_degraded" && run.terminatedReason !== "error") {
      scoreableAgencyTurns += 1;
      const narrative = String(step.narrative ?? dm.narrative ?? "").trim();
      const explicitResolution = typeof dm.is_action_legal === "boolean" && (typeof dm.consumes_time === "boolean" || progressed || dm.is_action_legal === false);
      if (narrative.length >= 40 && explicitResolution) responsiveAgencyTurns += 1;
    }
    const commit = dm.security_meta && typeof dm.security_meta === "object" && !Array.isArray(dm.security_meta)
      ? (dm.security_meta as Json).turn_commit as Json | undefined : undefined;
    const epistemicPostValidator = dm.security_meta && typeof dm.security_meta === "object" && !Array.isArray(dm.security_meta)
      ? (dm.security_meta as Json).epistemic_post_validator as Json | undefined : undefined;
    const governance = commit?.narrative_governance && typeof commit.narrative_governance === "object" && !Array.isArray(commit.narrative_governance)
      ? commit.narrative_governance as Json
      : undefined;
    const finalNarrativeMarkedSafe = epistemicPostValidator?.finalResponseSafe === true
      || governance?.narrativeGovernanceFinalSafe === true;
    const safetyCounts = commit?.safety_issue_counts;
    const unsupportedReasonCounts = commit?.unsupported_fact_reason_counts && typeof commit.unsupported_fact_reason_counts === "object" && !Array.isArray(commit.unsupported_fact_reason_counts)
      ? commit.unsupported_fact_reason_counts as Json
      : null;
    let worldIssueThisTurn = false;
    if (safetyCounts && typeof safetyCounts === "object" && !Array.isArray(safetyCounts)) {
      for (const [code, count] of Object.entries(safetyCounts as Json)) {
        if (code === "options_empty_or_degenerate" && (dm.turn_mode === "narrative_only" || dm.turn_mode === "system_transition" || dm.decision_required === false)) continue;
        if (typeof count === "number" && count > 0) {
          if (code === "unsupported_new_fact" && unsupportedReasonCounts && Object.keys(unsupportedReasonCounts).length > 0) {
            for (const [reason, reasonCount] of Object.entries(unsupportedReasonCounts)) {
              if (typeof reasonCount !== "number" || reasonCount <= 0) continue;
              recordBug(`validator:unsupported_new_fact:${reason}`, "validator", "minor", runId, `step=${step.stepIndex ?? "?"}; count=${reasonCount}; finalSafe=${finalNarrativeMarkedSafe}`, "needs_triage");
            }
            continue;
          }
          const repairedOrTelemetryOnly = code.endsWith("_bridge")
            || (finalNarrativeMarkedSafe && ["dm_only_fact_leaked_in_narrative", "floor_knowledge_overreach", "npc_knows_forbidden_fact", "root_cause_leak"].includes(code));
          recordBug(
            `validator:${code}`,
            "validator",
            code.includes("leak") ? "major" : "minor",
            runId,
            `step=${step.stepIndex ?? "?"}; count=${count}; finalSafe=${finalNarrativeMarkedSafe}`,
            repairedOrTelemetryOnly ? "expected_guard_hit" : "needs_triage",
          );
        }
        if (typeof count === "number" && count > 0 && !finalNarrativeMarkedSafe && ["unsupported_relationship_claim", "root_cause_leak"].includes(code)) worldIssueThisTurn = true;
      }
    }
    if (worldIssueThisTurn) worldConsistencyIssueTurns += 1;
    const rawOptions = Array.isArray(dm.decision_options) && dm.decision_options.length > 0 ? dm.decision_options : dm.options;
    const options = Array.isArray(rawOptions) ? rawOptions.filter((x): x is string => typeof x === "string") : [];
    if (options.length > 0) {
      choiceTurns += 1;
      const normalized = new Set(options.map((x) => x.trim().replace(/\s+/g, "")));
      if (normalized.size >= 2 && options.every((x) => x.trim().length >= 4)) meaningfulChoiceTurns += 1;
    }
    const touched = {
      tasks: /任务|委托|交付|领取|试炼/.test(action) || ["new_tasks", "task_updates"].some((key) => Array.isArray(dm[key]) && (dm[key] as unknown[]).length > 0),
      weapons: /武器|装备|铁管|锻造|修理|稳定|污染/.test(action) || ["weapon_updates", "weapon_bag_updates"].some((key) => Array.isArray(dm[key]) && (dm[key] as unknown[]).length > 0),
      combat: /攻击|战斗|反击|压制|威胁/.test(action) || dm.combat_summary != null || dm.conflict_outcome != null || (Array.isArray(dm.main_threat_updates) && dm.main_threat_updates.length > 0),
      codex: /图鉴|人物记录|线索记录/.test(action) || JSON.stringify(state.codexNpcIds) !== JSON.stringify(previous.codexNpcIds),
      economy: /原石|购买|出售|交易|价格|商店/.test(action) || (typeof dm.currency_change === "number" && dm.currency_change !== 0),
      profession: /职业|试炼|认证|守灯人|寻路者|觅兆者/.test(action) || dm.profession_trial_result != null || typeof dm.profession === "string",
      location: /前往|移动|进入|离开|上楼|下楼|走到/.test(action) || (typeof dm.player_location === "string" && dm.player_location !== previous.playerLocation),
    };
    for (const [feature, active] of Object.entries(touched)) {
      if (!active) continue;
      featureSignals[feature]!.touchedTurns += 1;
      const signal = featureJudgeSignals[feature];
      if (hasStepJudgeEvidence) {
        signal.weightSum += stepJudgeConfidence;
        signal.touchSamples += 1;
      }
      const contributed = feature === "tasks" ? ["new_tasks", "task_updates"].some((key) => Array.isArray(dm[key]) && (dm[key] as unknown[]).length > 0)
        : feature === "weapons" ? ["weapon_updates", "weapon_bag_updates"].some((key) => Array.isArray(dm[key]) && (dm[key] as unknown[]).length > 0)
        : feature === "combat" ? dm.conflict_outcome != null || (Array.isArray(dm.main_threat_updates) && dm.main_threat_updates.length > 0) || (typeof dm.sanity_damage === "number" && dm.sanity_damage !== 0)
        : feature === "codex" ? Array.isArray(dm.codex_updates) && dm.codex_updates.length > 0
        : feature === "economy" ? typeof dm.currency_change === "number" && dm.currency_change !== 0
        : feature === "profession" ? dm.profession_trial_result != null || typeof dm.profession === "string" || (Array.isArray(dm.task_updates) && dm.task_updates.length > 0)
        : feature === "location" ? typeof dm.player_location === "string" && dm.player_location !== previous.playerLocation : false;
      if (contributed) featureSignals[feature]!.progressionTurns += 1;
      if (contributed && hasStepJudgeEvidence) {
        signal.progressionWeightSum += stepJudgeConfidence;
        signal.progressionSamples += 1;
      }
    }
    previous = state;
  }
  const scoreableNarrative = run.executionMode !== "live_degraded" && run.terminatedReason !== "error";
  const transcript = toTranscript(run, steps);
  const scenario = SCENARIOS.find((candidate) => candidate.id === run.scenarioId);
  if (scoreableNarrative && steps.length > 0 && scenario?.subjectivePlayabilityEligible === true) {
    subjectiveEligibleRuns += 1;
    subjectiveAssessments.push(assessSubjectivePlayabilityProxy(transcript));
  }

  const transcriptLength = transcript.steps.length;
  const effectiveJudgeSource = scoreableNarrative && transcriptLength > 0 ? consistency : null;
  const baselineJudgeScore = typeof effectiveJudgeSource?.overallScore === "number" && Number.isFinite(effectiveJudgeSource.overallScore)
    ? clampScore(effectiveJudgeSource.overallScore)
    : null;
  const baselineJudgePassed = baselineJudgeScore !== null
    ? (typeof effectiveJudgeSource?.passed === "boolean" ? effectiveJudgeSource.passed : baselineJudgeScore >= 3)
    : false;
  let finalJudgeScore = baselineJudgeScore;
  let finalJudgePassed = baselineJudgePassed;

  const shouldRunCodexAlignment = baselineJudgeScore !== null
    && scoreableNarrative
    && transcriptLength > 0
    && runJudgeConfidenceSource !== "estimated";

  if (shouldRunCodexAlignment) {
    const codexJudge = await judgeNarrativeConsistencyCodex(transcript);
    const aligned = alignJudgeWithCodex({
      judgeMode,
      baselineScore: baselineJudgeScore,
      baselinePassed: baselineJudgePassed,
      codexJudge,
    });
    judgeCodexAgreementStats.total += 1;
    if (aligned.agrees) judgeCodexAgreementStats.agree += 1;
    judgeCodexAgreementStats.scoreGapSamples.push(aligned.scoreGap);
    finalJudgeScore = aligned.adjustedScore;
    finalJudgePassed = aligned.adjustedPassed;
    if (!aligned.agrees && aligned.agreementSeverity !== "none" && judgeMode !== "live" && judgeMode !== "codex") {
      const fingerprint = judgeMode === "mock"
        ? "validator:judge_disagreement_mock_vs_codex"
        : judgeMode === "fallback"
          ? "validator:judge_disagreement_fallback_vs_codex"
          : "validator:judge_disagreement_unknown_vs_codex";
      const mismatchSeverity: BugRow["severity"] = aligned.agreementSeverity === "critical" ? "major" : aligned.agreementSeverity === "major" ? "minor" : "minor";
      recordBug(
        fingerprint,
        "validator",
        mismatchSeverity,
        runId,
        `baselineScore=${aligned.baselineScore.toFixed(2)}; codexScore=${aligned.codexScore.toFixed(2)}; baselinePassed=${aligned.baselinePassed}; codexPassed=${aligned.codexPassed}; agreement=${aligned.agreementSeverity}`,
        "needs_triage",
      );
    }
  }
  if (finalJudgeScore !== null) {
    judgeCoverageRuns += 1;
    narrativeScores.push(finalJudgeScore);
    if (finalJudgePassed) judgeCoveragePasses += 1;
    const modeRow = judgeModeCounts[judgeMode];
    modeRow.scoreSamples += 1;
    if (finalJudgePassed) modeRow.passes += 1;
  }
  if (judgeComparison !== null) {
    judgeComparisonStats.runs += 1;
    if (judgeComparison.liveAvailable) judgeComparisonStats.liveAvailableRuns += 1;
    if (typeof judgeComparison.scoreGap === "number") judgeComparisonStats.scoreGapSamples.push(judgeComparison.scoreGap);
    if (typeof judgeComparison.criticalGap === "number") judgeComparisonStats.criticalGapSamples.push(judgeComparison.criticalGap);
    if (typeof judgeComparison.majorGap === "number") judgeComparisonStats.majorGapSamples.push(judgeComparison.majorGap);
    if (typeof judgeComparison.passAgreement === "boolean") {
      judgeComparisonStats.passAgreementRuns += 1;
      if (judgeComparison.passAgreement) judgeComparisonStats.passAgreement += 1;
    }
  }
  if (typeof run.narrativeRepetitionRate === "number") repetitionRates.push(run.narrativeRepetitionRate);
  else {
    const derivedRepetition = repetitionRateFromSteps(steps);
    if (derivedRepetition !== null) repetitionRates.push(derivedRepetition);
  }
  if (run.terminatedReason === "softlock") recordBug("runtime:softlock", "runtime", "critical", runId, "terminatedReason=softlock");
  if (run.terminatedReason === "error" || run.executionMode === "live_degraded") {
    const failureContext = extractRuntimeFailureContext(run, steps);
    const stepIndex = String(failureContext.stepIndex ?? "unknown");
    const classification = classifyRuntimeFailure({
      action: failureContext.action,
      reason: failureContext.reason,
      transportStatus: failureContext.transportStatus,
      aiStatus: failureContext.aiStatus,
      hasVisibleNarrative: failureContext.hasVisibleNarrative,
      stepFailureMode: failureContext.stepFailureMode,
    });
    const category = classification.fingerprint.startsWith("runtime:") ? "runtime" : "external_dependency";
    recordBug(
      classification.fingerprint,
      category,
      classification.severity,
      runId,
      `${classification.evidence}; step=${stepIndex}; evidence=${classification.evidence}`,
      classification.status,
    );
  }
  if (Array.isArray(run.invariantChecks)) {
    for (const check of run.invariantChecks as Json[]) for (const violation of Array.isArray(check.violations) ? check.violations as Json[] : []) {
      const rule = String(violation.rule ?? "unknown");
      if (rule === "dm_json_options_missing") {
        const matchingStep = steps.find((candidate) => candidate.stepIndex === check.stepIndex);
        const matchingDm = (matchingStep?.dmJson as Json | undefined) ?? {};
        if (matchingDm.turn_mode === "narrative_only" || matchingDm.turn_mode === "system_transition" || matchingDm.decision_required === false) continue;
      }
      const severity = violation.severity === "critical" || violation.severity === "major" ? violation.severity : "minor";
      recordBug(`invariant:${rule}`, "invariant", severity, runId, String(violation.description ?? rule));
    }
  }
}

const conclusiveRecords = records.filter((run) => ["pass", "fail"].includes(evidenceStatus(run)));
const inconclusiveRuns = records.length - conclusiveRecords.length;
const passed = conclusiveRecords.filter((run) => evidenceStatus(run) === "pass").length;
const softlocks = conclusiveRecords.filter((r) => r.terminatedReason === "softlock").length;
const errors = conclusiveRecords.filter((r) => r.terminatedReason === "error").length;
const avg = (items: number[]) => items.length ? items.reduce((a, b) => a + b, 0) / items.length : null;
const humanRows: Array<{ evaluatorId: string; sampleId: string; scores: Record<string, number> }> = [];
for (const file of humanResultPaths) {
  try {
    const result = JSON.parse(await readFile(file, "utf8")) as { evaluatorId?: unknown; evalType?: unknown; data?: unknown };
    if (typeof result.evaluatorId !== "string" || result.evalType !== "likert" || !Array.isArray(result.data)) continue;
    for (const raw of result.data) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const row = raw as Json;
      if (typeof row.sampleId !== "string" || !row.scores || typeof row.scores !== "object" || Array.isArray(row.scores)) continue;
      const scores = Object.fromEntries(Object.entries(row.scores as Json).flatMap(([id, score]) => typeof score === "number" && score >= 1 && score <= 7 ? [[id, score]] : []));
      if (Object.keys(scores).length) humanRows.push({ evaluatorId: result.evaluatorId, sampleId: row.sampleId, scores });
    }
  } catch { /* invalid or unfinished human worksheet result */ }
}
const humanEvaluators = new Set(humanRows.map((row) => row.evaluatorId)).size;
const humanDimensionValues: Record<string, number[]> = {};
for (const row of humanRows) for (const [id, score] of Object.entries(row.scores)) (humanDimensionValues[id] ??= []).push(1 + (score - 1) * 4 / 6);
const humanEvidenceReady = humanEvaluators >= 2 && humanRows.length >= 10;
const counterfactualRows: Array<{ meaningfulChoice: boolean; reasons: string[]; path: string }> = [];
for (const file of counterfactualResultPaths) {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as { assessment?: { meaningfulChoice?: unknown; reasons?: unknown } };
    if (typeof parsed.assessment?.meaningfulChoice !== "boolean") continue;
    counterfactualRows.push({ meaningfulChoice: parsed.assessment.meaningfulChoice, reasons: Array.isArray(parsed.assessment.reasons) ? parsed.assessment.reasons.map(String) : [], path: file });
  } catch { /* invalid or partial pair artifact */ }
}
const counterfactualMeaningfulRate = counterfactualRows.length
  ? counterfactualRows.filter((row) => row.meaningfulChoice).length / counterfactualRows.length
  : null;
const currentTurns = records.filter((run) => run.__evidenceCohort === "current").reduce((sum, run) => sum + (Array.isArray(run.steps) ? run.steps.length : 0), 0);
const proxyDimensions = Object.fromEntries((["actionPayoff", "tensionArc", "novelty", "choiceMeaning", "clarity", "continueDesire"] as const).map((id) => [id, subjectiveAssessments.length ? avg(subjectiveAssessments.map((item) => item.dimensions[id])) : null]));
const humanDimensions = Object.fromEntries(Object.entries(humanDimensionValues).map(([id, scores]) => [id, avg(scores)]));
const humanOverall = Object.values(humanDimensionValues).flat();
const subjectivePlayability = humanRows.length > 0 ? {
  source: "human",
  confidence: humanEvidenceReady ? Math.min(1, 0.55 + humanEvaluators * 0.1 + Math.min(0.15, humanRows.length / 100)) : 0.2,
  overallScore5: avg(humanOverall), sampleCount: humanRows.length, evaluatorCount: humanEvaluators,
  dimensions: humanDimensions, evidence: humanResultPaths, limitations: humanEvidenceReady ? [] : ["真人样本不足：至少需要 2 名评估者和 10 条评分。"],
} : {
  source: "heuristic_proxy", confidence: subjectiveAssessments.length ? avg(subjectiveAssessments.map((item) => item.confidence)) : 0,
  overallScore5: subjectiveAssessments.length ? avg(subjectiveAssessments.map((item) => item.overallScore5)) : null,
  sampleCount: subjectiveAssessments.length, evaluatorCount: 0, dimensions: proxyDimensions,
  evidence: subjectiveAssessments.flatMap((item) => item.evidence), limitations: ["这是零成本启发式代理，不等同于真人主观评价。", "功能删除仍需要真人盲测或随机 A/B。"],
};
const conclusiveRecordsCount = conclusiveRecords.length;
const judgeModeCoverage = conclusiveRecordsCount ? judgeCoverageRuns / conclusiveRecordsCount : 0;
const judgeConfidenceCoverage = judgeCoverageRuns ? clamp01(judgeConfidenceSampleCount / judgeCoverageRuns) : 0;
const trustedJudgeConfidenceCoverage = judgeCoverageRuns
  ? clamp01(judgeConfidenceTrustedSampleCount / judgeCoverageRuns)
  : 0;
const judgeConfidenceMean = judgeConfidenceSampleCount ? judgeConfidenceSampleSum / judgeConfidenceSampleCount : null;
const judgeConfidenceWeightedMean = judgeConfidenceEvidenceWeight
  ? judgeConfidenceWeightedSum / judgeConfidenceEvidenceWeight
  : judgeConfidenceMean;
const judgeConfidenceTrustedWeightedMean = judgeConfidenceTrustedEvidenceWeight
  ? judgeConfidenceTrustedWeightedSum / judgeConfidenceTrustedEvidenceWeight
  : null;
const judgePassRate = judgeCoverageRuns ? judgeCoveragePasses / judgeCoverageRuns : 0;
const judgePassConfidence = estimatePassConfidence(judgePassRate, judgeCoverageRuns);
const judgePassCoverageCI = wilsonInterval(judgeCoveragePasses, judgeCoverageRuns);
const judgePassAgreementRate = judgeComparisonStats.passAgreementRuns ? judgeComparisonStats.passAgreement / judgeComparisonStats.passAgreementRuns : null;
const judgePassAgreementRuns = judgeComparisonStats.passAgreementRuns;
const judgePassAgreementPasses = judgeComparisonStats.passAgreement === null || judgePassAgreementRuns === 0
  ? 0
  : Math.round(judgePassAgreementRate! * judgePassAgreementRuns);
const judgePassAgreementCI = judgePassAgreementRuns > 0
  ? wilsonInterval(judgePassAgreementPasses, judgePassAgreementRuns)
  : null;
const judgeScoreGap = avg(judgeComparisonStats.scoreGapSamples);
const judgeCriticalGap = avg(judgeComparisonStats.criticalGapSamples);
const judgeMajorGap = avg(judgeComparisonStats.majorGapSamples);
const judgeCrossCoverage = conclusiveRecordsCount ? judgeComparisonStats.runs / conclusiveRecordsCount : 0;
const judgeCodexAgreementRate = judgeCodexAgreementStats.total ? judgeCodexAgreementStats.agree / judgeCodexAgreementStats.total : null;
const judgeCodexCoverage = judgeCoverageRuns ? judgeCodexAgreementStats.total / judgeCoverageRuns : 0;
const judgeCodexAvgGap = avg(judgeCodexAgreementStats.scoreGapSamples);
const judgeCodexGapScoreAgreement = judgeCodexAvgGap === null ? 1 : clamp01(1 - judgeCodexAvgGap / 2.5);
const judgeGapAgreement = judgeScoreGap === null ? 1 : clamp01(1 - judgeScoreGap / 2.5);
const judgeCrossPenalty = avg([judgeCriticalGap, judgeMajorGap].filter((value): value is number => value !== null && Number.isFinite(value)));
const judgeCrossPenaltyFactor = judgeCrossPenalty === null ? 1 : clamp01(1 - Math.max(0, judgeCrossPenalty) / 4);
const judgeCrossAgreementConfidence = judgePassAgreementRate !== null
  ? estimatePassConfidence(judgePassAgreementRate, judgePassAgreementRuns)
  : 0;
const hasRawNarrativeJudgeConfidence = judgeConfidenceTrustedWeightedMean !== null && Number.isFinite(judgeConfidenceTrustedWeightedMean);
const narrativeJudgeConfidenceFromJudgeOnly = hasRawNarrativeJudgeConfidence ? clamp01(judgeConfidenceTrustedWeightedMean) : null;
const narrativeJudgeAgreementSignal = clamp01((judgeCodexAgreementRate ?? 0) * 0.45 + judgeCrossAgreementConfidence * 0.55);
const narrativeJudgeConfidence = hasRawNarrativeJudgeConfidence
  ? clamp01((narrativeJudgeConfidenceFromJudgeOnly! * 0.7) + clamp01((judgeCodexAgreementRate ?? 1) * 0.2 + judgeCrossAgreementConfidence * 0.1))
  : clamp01(narrativeJudgeAgreementSignal * 0.7);
const narrativeJudgeReliability = scoreStabilityConf(narrativeScores);
const narrativeJudgeConfidenceAdjusted = clamp01(narrativeJudgeConfidence * 0.9 + narrativeJudgeReliability * 0.1);
const narrativeJudgeConfidenceRaw = narrativeJudgeConfidenceFromJudgeOnly ?? null;
const signals: ProductQualitySignals = {
  runs: conclusiveRecords.length,
  turns,
  passRate: conclusiveRecords.length ? passed / conclusiveRecords.length : 0,
  softlockRate: conclusiveRecords.length ? softlocks / conclusiveRecords.length : 0,
  errorRate: conclusiveRecords.length ? errors / conclusiveRecords.length : 0,
  p50LatencyMs: percentile(latencies, 0.5),
  p95LatencyMs: percentile(latencies, 0.95),
  narrativeScore5: avg(narrativeScores),
  narrativeJudgeConfidenceRaw: hasRawNarrativeJudgeConfidence ? narrativeJudgeConfidenceRaw : undefined,
  narrativeJudgeConfidence: narrativeJudgeConfidenceAdjusted,
  repetitionRate: avg(repetitionRates),
  worldConsistencyIssueTurnRate: turns ? worldConsistencyIssueTurns / turns : null,
  progressionTurnRate: turns ? progressionTurns / turns : null,
  agencyResponseRate: scoreableAgencyTurns ? responsiveAgencyTurns / scoreableAgencyTurns : null,
  meaningfulChoiceRate: counterfactualMeaningfulRate ?? (choiceTurns ? meaningfulChoiceTurns / choiceTurns : null),
  structuredConsequenceRate: consequenceOpportunityTurns ? structuredConsequenceTurns / consequenceOpportunityTurns : null,
  deadTurnRate: consequenceOpportunityTurns ? deadTurns / consequenceOpportunityTurns : null,
  narrativeJudgeConfidenceSampleCount: judgeConfidenceSampleCount,
  narrativeJudgeConfidenceCoverage: judgeConfidenceCoverage,
  trustedNarrativeJudgeConfidenceCoverage: trustedJudgeConfidenceCoverage,
  narrativeJudgeConfidenceTrustedSampleCount: judgeConfidenceTrustedSampleCount,
  judgePassRate,
  judgePassRuns: judgeCoverageRuns,
  judgePassAgreementRate,
  judgeCodexAgreementRate,
  tokenInput: tokenCoveredTurns ? tokenInput : null,
  tokenOutput: tokenCoveredTurns ? tokenOutput : null,
  tokenCachedInput: tokenCoveredTurns ? tokenCachedInput : null,
  // Official DeepSeek V4 Flash USD price snapshot (2026-07-13), normalized
  // to one cache-miss input token: hit=.0028/.14=.02; output=.28/.14=2.
  tokenCostEquivalent: tokenCoveredTurns
    ? Math.max(0, tokenInput - tokenCachedInput) + tokenCachedInput * 0.02 + tokenOutput * 2
    : null,
  tokenCostProfile: "deepseek-v4-flash-usd-2026-07-13",
  tokenCoveredTurns,
  tokenCoverageRate: turns ? tokenCoveredTurns / turns : 0,
};
const featureSignalReports: Record<string, FeatureDecisionReport> = Object.fromEntries(
  Object.entries(featureSignals).map(([id, signal]) => {
    const featureJudgeSignal = featureJudgeSignals[id] ?? { weightSum: 0, touchSamples: 0, progressionWeightSum: 0, progressionSamples: 0 };
    const featureJudgeConfidence = featureJudgeSignal.touchSamples > 0
      ? clamp01(featureJudgeSignal.weightSum / featureJudgeSignal.touchSamples)
      : null;
    const summary = featureDecisionWithConfidence(signal, featureJudgeConfidence === null ? null : clamp01(featureJudgeConfidence));
    return [id, {
      touchedTurns: signal.touchedTurns,
      progressionTurns: signal.progressionTurns,
      contributionRate: signal.touchedTurns ? signal.progressionTurns / signal.touchedTurns : null,
      decision: summary.decision,
      confidence: summary.confidence,
      interval: summary.interval,
      rationale: summary.rationale,
      evidenceLabel: summary.evidence.label,
      judgeReliability: featureJudgeSignal.touchSamples > 0 && featureJudgeSignal.weightSum > 0 ? clamp01(featureJudgeSignal.weightSum / featureJudgeSignal.touchSamples) : null,
    }];
  }),
) as Record<string, FeatureDecisionReport>;
const report = {
  generatedAt: new Date().toISOString(),
  inputs: { baseline: inputDirs, current: currentInputDirs },
  evidence: {
    traceRuns: records.length,
    duplicateArtifactsExcluded: duplicateArtifactCount,
    conclusiveRuns: conclusiveRecords.length,
    inconclusiveRuns,
    turns,
    latencySamples: latencies.length,
    narrativeJudgeSamples: narrativeScores.length,
    narrativeJudgeConfidenceInputs: {
      judgeModeCoverage,
      judgeConfidenceCoverage,
      trustedJudgeConfidenceCoverage,
      judgeConfidenceSampleCount,
      trustedJudgeConfidenceSampleCount: judgeConfidenceTrustedSampleCount,
      judgeConfidenceSampleMean: judgeConfidenceMean,
      judgeConfidenceWeightedMean,
      judgeConfidenceTrustedWeightedMean,
      judgeModelSampleCount,
      judgeConfidenceSamplesBySource,
      judgeCoverageRuns,
      judgeCoveragePasses,
      judgePassRate,
      judgePassConfidence,
      judgePassCoverageCI: judgePassCoverageCI ? { lower: judgePassCoverageCI.lower, upper: judgePassCoverageCI.upper } : null,
      judgePassAgreementRuns,
      judgePassAgreementRate,
      judgePassAgreementCI: judgePassAgreementCI ? { lower: judgePassAgreementCI.lower, upper: judgePassAgreementCI.upper } : null,
      narrativeJudgeReliability,
      judgeCrossCoverage,
      judgeCodexAgreementRate,
      judgeCodexCoverage,
      judgeCodexAvgGap,
      judgeCodexGapScoreAgreement,
      judgeScoreGap,
      judgeCriticalGap,
      judgeMajorGap,
      judgeGapAgreement,
      judgeCrossAgreementConfidence,
      judgeCrossPenaltyFactor,
    },
    judgeModeRuns: Object.fromEntries(Object.entries(judgeModeCounts).map(([mode, row]) => [mode, row])),
    subjectiveEligibleRuns,
    counterfactualPairs: counterfactualRows.length,
    tokenSamples: tokenCoveredTurns,
  },
  costEvidence: {
    inputTokens: tokenInput,
    outputTokens: tokenOutput,
    cachedInputTokens: tokenCachedInput,
    cachedInputRate: tokenInput > 0 ? tokenCachedInput / tokenInput : null,
    promptComponents: Object.fromEntries(Object.entries(promptComponentTotals).map(([id, row]) => [id, { averageChars: row.samples ? row.chars / row.samples : null, samples: row.samples }]).sort((a, b) => Number(b[1].averageChars ?? 0) - Number(a[1].averageChars ?? 0))),
  },
  promptVariantExperiment: Object.fromEntries(Object.entries(promptVariantRuns).map(([id, row]) => [id, {
    runs: row.runs,
    conclusiveRuns: row.runs - row.inconclusive,
    inconclusiveRuns: row.inconclusive,
    passRate: row.runs - row.inconclusive > 0 ? row.passed / (row.runs - row.inconclusive) : null,
    degradedRate: row.runs ? row.degraded / row.runs : null,
    averageInputTokens: row.tokenSamples ? row.inputTokens / row.tokenSamples : null,
  }])),
  signals,
  scorecard: buildProductQualityScorecard(signals),
  subjectivePlayability,
  counterfactualChoice: { pairs: counterfactualRows.length, meaningfulRate: counterfactualMeaningfulRate, evidence: counterfactualRows },
  decisionGates: [
    ...(!humanEvidenceReady ? ["human_playability_evidence_missing"] : []),
    ...(subjectiveEligibleRuns < 5 ? ["playability_proxy_sample_too_small"] : []),
    ...(counterfactualRows.length === 0 ? ["counterfactual_choice_evidence_missing"] : []),
    ...(conclusiveRecords.length < 5 ? ["conclusive_run_sample_too_small"] : []),
    ...(turns < 30 ? ["turn_sample_too_small"] : []),
  ],
  featureDecisionPolicy: {
    delete: "需要低使用率、低推进贡献、低满意度且移除实验无负面影响四项证据；当前 trace 不单独授权删除功能。",
    simplify: "连续两期推进贡献低于 10%，或导致 softlock/错误的流程，可进入简化实验。",
    keep: "稳定贡献推进、选择差异或叙事质量，且没有显著成本/故障负担。",
  },
  featureSignals: featureSignalReports,
  turnDiagnostics: turnDiagnostics.sort((a, b) => (b.inputTokens ?? 0) - (a.inputTokens ?? 0)),
  bugLedger: [...bugLedger.values()].map((row) => ({
    ...row,
    cohortDisposition: classifyBugCohort(row),
    ratePer100Turns: turns ? row.count / turns * 100 : 0,
    currentRatePer100Turns: currentTurns ? row.currentCount / currentTurns * 100 : null,
  })).sort((a, b) =>
    ({ reproduced_current: 3, guard_observed_current: 2, historical_not_observed_in_current_sample: 1 }[b.cohortDisposition] - { reproduced_current: 3, guard_observed_current: 2, historical_not_observed_in_current_sample: 1 }[a.cohortDisposition]) ||
    ({ confirmed: 3, needs_triage: 2, expected_guard_hit: 1 }[b.status] - { confirmed: 3, needs_triage: 2, expected_guard_hit: 1 }[a.status]) ||
    ({ critical: 3, major: 2, minor: 1 }[b.severity] - { critical: 3, major: 2, minor: 1 }[a.severity]) || b.count - a.count
  ),
  bugRiskSummary: summarizeBugRisk({
    rows: [...bugLedger.values()],
    turns,
  }),
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2), "utf8");
const score = report.scorecard;
const judgeConfidenceEvidenceType = score.confidenceTrace.rawEvidenceUsed
  ? "direct-raw"
  : score.confidenceTrace.source === "judge_coverage_inferred"
    ? "coverage-inferred"
    : "heuristic-only";
const confidenceWarnings: string[] = [];
if (score.confidenceTrace.source === "heuristic_only") {
  confidenceWarnings.push("当前 Overall 置信来自纯规则推断，不属于 AI/Codex 原始裁判置信。");
} else if (score.confidenceTrace.source === "judge_coverage_inferred") {
  confidenceWarnings.push("当前 Overall 置信为裁判覆盖率+一致性推断，未拿到 AI/Codex 的原始 judgeConfidence。");
}
if (!score.confidenceTrace.rawEvidenceUsed) {
  confidenceWarnings.push("该样本未拿到原始 AI/Codex 裁判置信。如当前质量闸道处于发布模式（默认 codex/live），本次会被判定为置信不足。探索性运行可设置 VERSECRAFT_EVAL_AUTO_REQUIRE_RAW_AI_CONFIDENCE=0 暂时放宽。");
}
const judgePassCoverageLabel = judgePassCoverageCI
  ? `${(judgePassCoverageCI.lower * 100).toFixed(1)}~${(judgePassCoverageCI.upper * 100).toFixed(1)}%`
  : "n/a";
const judgeAgreementLabel = judgePassAgreementCI
  ? `${(judgePassAgreementCI.lower * 100).toFixed(1)}~${(judgePassAgreementCI.upper * 100).toFixed(1)}%`
  : "n/a";
const markdown = [
  "# VerseCraft 产品质量证据报告",
  "",
  `生成时间：${report.generatedAt}`,
  `证据：${records.length} 个 run / ${turns} 个回合；总体置信度 ${(score.confidence * 100).toFixed(0)}%。`,
  `置信路径：${score.confidenceTrace.source}（rawEvidenceUsed=${score.confidenceTrace.rawEvidenceUsed ? "是" : "否"}，置信来源=${judgeConfidenceEvidenceType}，置信下限Floor=${(score.confidenceTrace.evidenceFloor * 100).toFixed(0)}%）。`,
  `置信来源说明：${score.confidenceTrace.confidencePathPenaltyReason.join("；")}`,
  ...confidenceWarnings.map((line) => `- ${line}`),
  `叙事裁判置信度：${(narrativeJudgeConfidence * 100).toFixed(0)}%（来源：真实裁判置信样本 ${(judgeConfidenceSampleCount)} 条，可信来源(模型/Codex) ${(judgeConfidenceTrustedSampleCount)} 条，覆盖 ${(judgeConfidenceCoverage * 100).toFixed(1)}% / ${(trustedJudgeConfidenceCoverage * 100).toFixed(1)}%，`
    + `原始裁判置信度：${narrativeJudgeConfidenceRaw === null ? "缺失" : `${(narrativeJudgeConfidenceRaw * 100).toFixed(0)}%`}，`
    + `裁判通过率 ${judgeCoveragePasses}/${judgeCoverageRuns}，95%CI [${judgePassCoverageLabel}]，`
  + `评分稳定性 ${(narrativeJudgeReliability * 100).toFixed(1)}%；mock-live对账覆盖 ${(judgeCrossCoverage * 100).toFixed(1)}%，`
  + `对账一致率 ${(judgePassAgreementRate === null ? "n/a" : `${(judgePassAgreementRate * 100).toFixed(1)}%`)}，`
  + `codex复核覆盖 ${(judgeCodexCoverage * 100).toFixed(1)}%，`
  + `codex一致率 ${(judgeCodexAgreementRate === null ? "n/a" : `${(judgeCodexAgreementRate * 100).toFixed(1)}%`)}，`
  + `codex分数偏差均值 ${(judgeCodexAvgGap === null ? "n/a" : judgeCodexAvgGap.toFixed(2))}，`
  + `对账通过率CI [${judgeAgreementLabel}]，`
  + `scoreGap均值 ${judgeScoreGap === null ? "n/a" : judgeScoreGap.toFixed(2)}）`,
  `裁判来源统计：${Object.entries(judgeModeCounts).map(([mode, row]) => `${mode} ${row.scoreSamples}`).join("；")}`,
  "",
  "## 结论",
  "",
  `当前质量点估计：${score.overallScore === null ? "证据不足，暂不评分" : score.overallScore.toFixed(1) + "/100"}。该分数必须与置信度一起阅读。`,
  ...(score.blockers.length ? score.blockers.map((item) => `- 证据门禁：${item}`) : ["- 当前没有证据门禁。"]),
  ...report.decisionGates.map((item) => `- 产品决策门禁：${item}`),
  ...(score.recommendations.length ? score.recommendations.map((item) => `- ${item.trim()}`) : ["- 当前样本没有触发自动改进建议。"]),
  "",
  "## 主观可玩性代理",
  "",
  `${report.subjectivePlayability.source === "human" ? "真人量表" : "启发式代理"}：${report.subjectivePlayability.overallScore5 === null ? "—" : report.subjectivePlayability.overallScore5.toFixed(2) + "/5"}；置信度 ${((report.subjectivePlayability.confidence ?? 0) * 100).toFixed(0)}%；样本 ${report.subjectivePlayability.sampleCount}；评估者 ${report.subjectivePlayability.evaluatorCount}。`,
  ...Object.entries(report.subjectivePlayability.dimensions).map(([id, value]) => `- ${id}: ${typeof value === "number" ? value.toFixed(2) : "—"}`),
  ...report.subjectivePlayability.limitations.map((item) => `- 限制：${item}`),
  `- 反事实选择对：${report.counterfactualChoice.pairs}；结构化结果差异率：${report.counterfactualChoice.meaningfulRate === null ? "—" : (report.counterfactualChoice.meaningfulRate * 100).toFixed(1) + "%"}`,
  "",
  "## 分维度评分",
  "",
  "| 维度 | 分数 | 证据强度 | 依据 |",
  "|---|---:|---|---|",
  ...score.dimensions.map((dimension) => `| ${dimension.id} | ${dimension.score === null ? "—" : dimension.score.toFixed(1)} | ${dimension.evidence} | ${dimension.reasons.join("；")} |`),
  "",
  "## 功能证据",
  "",
  "| 功能 | 触达 | 有效贡献 | 贡献率 | 当前决策 | 决策置信 | 证据 | 裁判支撑 |",
  "|---|---:|---:|---:|---|---:|---|---:|",
  ...Object.entries(report.featureSignals).map(([id, raw]) => {
    const row = raw as FeatureDecisionReport;
    const confidence = typeof row.confidence === "number" ? `${(row.confidence * 100).toFixed(1)}%` : "—";
    const ci = row.interval === null ? "—" : `[${(row.interval.lower * 100).toFixed(1)}%, ${(row.interval.upper * 100).toFixed(1)}%]`;
    const judgeSupport = row.judgeReliability === null ? "—" : `${(row.judgeReliability * 100).toFixed(1)}%`;
    return `| ${id} | ${row.touchedTurns} | ${row.progressionTurns} | ${row.contributionRate === null ? "—" : (row.contributionRate * 100).toFixed(1) + "%"} | ${row.decision} | ${confidence} | ${row.evidenceLabel} / ${ci} | ${judgeSupport} |`;
  }),
  "",
  "> 删除功能需要低使用、低贡献、低满意度和移除实验无伤害四类证据；本报告不会仅凭 trace 自动授权删除。",
  "",
  "## Bug 与待复核告警",
  "",
  ...(report.bugLedger.length ? report.bugLedger.map((row) => `- [${row.cohortDisposition}/${row.status}/${row.severity}] ${row.fingerprint}：历史 ${row.baselineCount} 次，当前 ${row.currentCount} 次${row.currentRatePer100Turns === null ? "" : `（${row.currentRatePer100Turns.toFixed(1)}/100 当前回合）`}。`) : ["- 本批样本没有记录到 Bug 或 validator 告警。"]),
  "",
  "## 缺陷风险摘要",
  `- 可动作缺陷总数：${report.bugRiskSummary.totalActionableBugs}（critical=${report.bugRiskSummary.criticalActionableBugs} / major=${report.bugRiskSummary.majorActionableBugs} / minor=${report.bugRiskSummary.minorActionableBugs}）`,
  `- 风险分型：${report.bugRiskSummary.totalRows}（reproduced=${report.bugRiskSummary.reproducedRowsCurrent} / guard_observed=${report.bugRiskSummary.guardObservedRowsCurrent}）`,
  `- 可动作缺陷率：${report.bugRiskSummary.actionableRatePer100Turns === null ? "n/a" : `${report.bugRiskSummary.actionableRatePer100Turns.toFixed(2)}/100 回合`}`,
  ...(report.bugRiskSummary.topActionableFingerprints.length > 0 ? [`- Top 风险告警：${report.bugRiskSummary.topActionableFingerprints.join("；")}`] : []),
  "",
  "## 回合成本与空转诊断",
  "",
  ...(report.turnDiagnostics.length ? report.turnDiagnostics.map((row) => `- ${row.runId}#${row.stepIndex}：${row.flags.join(", ")}；input=${row.inputTokens ?? "?"}，cached=${row.cachedInputTokens ?? "?"}，output=${row.outputTokens ?? "?"}，costEq=${row.costEquivalentTokens === null ? "?" : row.costEquivalentTokens.toFixed(0)}，latency=${row.latencyMs ?? "?"}ms；行动：${row.action}`) : ["- 没有达到诊断阈值的回合。"]),
  "",
  `缓存输入占比：${report.costEvidence.cachedInputRate === null ? "—" : (report.costEvidence.cachedInputRate * 100).toFixed(1) + "%"}。`,
  ...Object.entries(report.costEvidence.promptComponents).slice(0, 10).map(([id, row]) => `- ${id}: 平均 ${typeof row.averageChars === "number" ? row.averageChars.toFixed(0) : "—"} chars（${row.samples} 样本）`),
  "",
  "### Prompt 变体实验",
  ...Object.entries(report.promptVariantExperiment).map(([id, row]) => `- ${id}: ${row.runs} runs（有结论 ${row.conclusiveRuns}，未完成 ${row.inconclusiveRuns}）；pass=${row.passRate === null ? "—" : (row.passRate * 100).toFixed(1) + "%"}；degraded=${row.degradedRate === null ? "—" : (row.degradedRate * 100).toFixed(1) + "%"}；avgInput=${row.averageInputTokens === null ? "—" : row.averageInputTokens.toFixed(0)}`),
  "",
].join("\n");
await mkdir(dirname(markdownOutput), { recursive: true });
await writeFile(markdownOutput, markdown, "utf8");
console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
