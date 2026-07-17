import assert from "node:assert/strict";
import test from "node:test";

import {
  parseBugGate,
  parseCostGate,
  parseConfidenceSourceRequirement,
  resolveConfidenceSourceRequirement,
  validateBugRisk,
  validateConfidenceQuality,
  validateCostConstraints,
  validateConfidenceSource,
} from "./run-quality-gate";

type Report = {
  qualityScore: number | null;
  qualityConfidence: number | null;
  blockers: string[];
  confidenceSource?: string | null;
  confidenceRawUsed?: boolean;
  confidenceComponents?: Array<{ name: string; value: number; weight: number; note: string }>;
  confidenceFloor?: number;
  tokenInput?: number | null;
  tokenOutput?: number | null;
  tokenCachedInput?: number | null;
  tokenCostEquivalent?: number | null;
  tokenCostProfile?: string | null;
  tokenCoveredTurns?: number;
  tokenCoverageRate?: number;
  turns?: number;
  turnDiagnostics: Array<{ runId: string; stepIndex: number | string; flags: string[]; latencyMs: number | null; action: string }>;
  featureSignals: Record<string, unknown>;
  bugLedger: Array<{ fingerprint: string; cohortDisposition: string; status: string; severity: string; baselineCount: number; currentCount: number; currentActionableCount: number; currentRatePer100Turns?: number | null }>;
};

function makeSummary(overrides: Partial<Report> = {}): Report {
  return {
    qualityScore: 80,
    qualityConfidence: 0.9,
    blockers: [],
    tokenInput: 1_000,
    tokenOutput: 100,
    tokenCachedInput: 200,
    tokenCostEquivalent: 1_600,
    tokenCostProfile: "deepseek-v4-flash-usd",
    tokenCoveredTurns: 8,
    tokenCoverageRate: 1,
    turns: 8,
    bugLedger: [],
    turnDiagnostics: [],
    featureSignals: {},
    ...overrides,
  };
}

test("parseCostGate 默认不启用，门限为 null", () => {
  const parsed = parseCostGate(["--live", "--max-cost-equivalent", "3000", "--max-cost-per-turn", "200"]);
  assert.equal(parsed.enforceCost, false);
  assert.equal(parsed.maxCostEquivalent, null);
  assert.equal(parsed.maxCostPerTurn, null);
  assert.equal(parsed.maxInputTokens, null);
  assert.equal(parsed.maxOutputTokens, null);
});

test("parseCostGate 读取显式成本门限", () => {
  const parsed = parseCostGate(["--enforce-cost", "--max-cost-equivalent", "3000", "--max-cost-per-turn", "250", "--max-input-tokens", "2500", "--max-output-tokens", "500"]);
  assert.equal(parsed.enforceCost, true);
  assert.equal(parsed.maxCostEquivalent, 3000);
  assert.equal(parsed.maxCostPerTurn, 250);
  assert.equal(parsed.maxInputTokens, 2500);
  assert.equal(parsed.maxOutputTokens, 500);
});

test("parseBugGate 默认不启用，阈值为 null", () => {
  const parsed = parseBugGate(["--live", "--max-critical-bugs", "1", "--max-major-bugs", "2"]);
  assert.equal(parsed.enforceBugGate, false);
  assert.equal(parsed.maxCriticalBugs, null);
  assert.equal(parsed.maxMajorBugs, null);
  assert.equal(parsed.maxMinorBugs, null);
  assert.equal(parsed.maxActionableBugs, null);
  assert.equal(parsed.maxActionableBugsPer100Turns, null);
});

test("parseBugGate 读取显式缺陷阈值", () => {
  const parsed = parseBugGate([
    "--enforce-bug-gate",
    "--max-critical-bugs",
    "0",
    "--max-major-bugs",
    "1",
    "--max-minor-bugs",
    "5",
    "--max-actionable-bugs",
    "10",
    "--max-actionable-bugs-per-100-turns",
    "1.5",
  ]);
  assert.equal(parsed.enforceBugGate, true);
  assert.equal(parsed.maxCriticalBugs, 0);
  assert.equal(parsed.maxMajorBugs, 1);
  assert.equal(parsed.maxMinorBugs, 5);
  assert.equal(parsed.maxActionableBugs, 10);
  assert.equal(parsed.maxActionableBugsPer100Turns, 1.5);
});

test("parseConfidenceSourceRequirement 支持 raw_ai / judge_coverage_inferred / heuristic_only", () => {
  const envBackup = process.env.VERSECRAFT_EVAL_REQUIRE_CONFIDENCE_SOURCE;
  assert.equal(parseConfidenceSourceRequirement(["--require-confidence-source=raw_ai"]), "raw_ai");
  assert.equal(parseConfidenceSourceRequirement(["--require-confidence-source", "heuristic_only"]), "heuristic_only");
  assert.equal(parseConfidenceSourceRequirement(["--require-confidence-source", "invalid"]), undefined);

  process.env.VERSECRAFT_EVAL_REQUIRE_CONFIDENCE_SOURCE = "judge_coverage_inferred";
  assert.equal(parseConfidenceSourceRequirement([]), "judge_coverage_inferred");
  process.env.VERSECRAFT_EVAL_REQUIRE_CONFIDENCE_SOURCE = envBackup;
});

test("resolveConfidenceSourceRequirement 默认在启用置信门禁时回退到 raw_ai", () => {
  assert.equal(resolveConfidenceSourceRequirement([], true), "raw_ai");
  assert.equal(resolveConfidenceSourceRequirement(["--require-confidence-source", "judge_coverage_inferred"], true), "judge_coverage_inferred");
  assert.equal(resolveConfidenceSourceRequirement([], false), undefined);
});

test("validateCostConstraints 不启用时通过", () => {
  const summary = makeSummary();
  const cfg = {
    enforceCost: false,
    maxCostEquivalent: 100,
    maxCostPerTurn: 100,
    maxInputTokens: 100,
    maxOutputTokens: 100,
    live: false,
    out: "",
    profile: "standard" as const,
    sessions: 1,
    steps: 1,
    maxLiveCalls: 60,
    judgeMode: "codex" as const,
    compareJudge: false,
    includePlan: false,
    skipQuality: false,
    skipPlaythrough: false,
    baseUrl: "",
    enforceConfidence: false,
    minConfidence: 0,
  } as any;
  assert.equal(validateCostConstraints(summary, cfg).pass, true);
});

test("validateCostConstraints 命中成本门槛会失败", () => {
  const summary = makeSummary({
    tokenCostEquivalent: 3500,
    tokenCostProfile: "deepseek-v4-flash",
    tokenInput: 2200,
    tokenOutput: 350,
    tokenCoveredTurns: 10,
    tokenCoverageRate: 0.9,
  });
  const cfg = {
    enforceCost: true,
    maxCostEquivalent: 3000,
    maxCostPerTurn: 300,
    maxInputTokens: 2000,
    maxOutputTokens: 300,
    live: false,
    out: "",
    profile: "standard" as const,
    sessions: 1,
    steps: 1,
    maxLiveCalls: 60,
    judgeMode: "codex" as const,
    compareJudge: false,
    includePlan: false,
    skipQuality: false,
    skipPlaythrough: false,
    baseUrl: "",
    enforceConfidence: false,
    minConfidence: 0,
  } as any;
  const result = validateCostConstraints(summary, cfg);
  assert.equal(result.pass, false);
  assert.equal(result.blockers.includes("cost_equivalent_exceeded"), true);
  assert.equal(result.blockers.includes("input_token_budget_exceeded"), true);
  assert.equal(result.blockers.includes("output_token_budget_exceeded"), true);
});

test("validateConfidenceSource 支持明确要求的来源", () => {
  const summary = makeSummary({ confidenceSource: "raw_ai" });
  const cfg = {
    requiredConfidenceSource: "raw_ai",
    live: false,
    out: "",
    profile: "standard" as const,
    sessions: 1,
    steps: 1,
    maxLiveCalls: 60,
    judgeMode: "codex" as const,
    compareJudge: false,
    includePlan: false,
    skipQuality: false,
    skipPlaythrough: false,
    baseUrl: "",
    parallel: 1,
    enforceConfidence: false,
    minConfidence: 0,
    enforceCost: false,
    maxCostEquivalent: null,
    maxCostPerTurn: null,
    maxInputTokens: null,
    maxOutputTokens: null,
  } as any;
  assert.equal(validateConfidenceSource(summary, cfg).pass, true);
  const miss = validateConfidenceSource(makeSummary({ confidenceSource: "heuristic_only" }), { ...cfg, requiredConfidenceSource: "raw_ai" });
  assert.equal(miss.pass, false);
  assert.equal(miss.blockers.includes("confidence_source_mismatch"), true);
});

test("validateConfidenceSource 在默认 raw_ai 策略下拒绝 judge_coverage_inferred", () => {
  const summary = makeSummary({ confidenceSource: "judge_coverage_inferred" });
  const cfg = {
    requiredConfidenceSource: "raw_ai",
    live: false,
    out: "",
    profile: "standard" as const,
    sessions: 1,
    steps: 1,
    maxLiveCalls: 60,
    judgeMode: "codex" as const,
    compareJudge: false,
    includePlan: false,
    skipQuality: false,
    skipPlaythrough: false,
    baseUrl: "",
    parallel: 1,
    enforceConfidence: true,
    minConfidence: 0.7,
    enforceCost: false,
    maxCostEquivalent: null,
    maxCostPerTurn: null,
    maxInputTokens: null,
    maxOutputTokens: null,
  } as any;
  const miss = validateConfidenceSource(summary, cfg);
  assert.equal(miss.pass, false);
  assert.equal(miss.blockers.includes("confidence_source_mismatch"), true);
});

test("validateConfidenceQuality 会阻止 heuristic_only 置信源", () => {
  const summary = makeSummary({ confidenceSource: "heuristic_only", qualityConfidence: 0.88 });
  const cfg = {
    enforceConfidence: true,
    minConfidence: 0.8,
    live: false,
    out: "",
    profile: "standard" as const,
    sessions: 1,
    steps: 1,
    maxLiveCalls: 60,
    judgeMode: "codex" as const,
    compareJudge: false,
    includePlan: false,
    skipQuality: false,
    skipPlaythrough: false,
    baseUrl: "",
    parallel: 1,
    requiredConfidenceSource: undefined,
    enforceCost: false,
    maxCostEquivalent: null,
    maxCostPerTurn: null,
    maxInputTokens: null,
    maxOutputTokens: null,
  } as any;

  const result = validateConfidenceQuality(summary, cfg);
  assert.equal(result.pass, false);
  assert.equal(result.blockers.includes("confidence_source_too_weak"), true);
});

test("validateConfidenceQuality 会阻止 judge_coverage_inferred 且无原始置信样本", () => {
  const summary = makeSummary({ confidenceSource: "judge_coverage_inferred", confidenceRawUsed: false, qualityConfidence: 0.91 });
  const cfg = {
    enforceConfidence: true,
    minConfidence: 0.7,
    live: false,
    out: "",
    profile: "standard" as const,
    sessions: 1,
    steps: 1,
    maxLiveCalls: 60,
    judgeMode: "codex" as const,
    compareJudge: false,
    includePlan: false,
    skipQuality: false,
    skipPlaythrough: false,
    baseUrl: "",
    parallel: 1,
    requiredConfidenceSource: undefined,
    enforceCost: false,
    maxCostEquivalent: null,
    maxCostPerTurn: null,
    maxInputTokens: null,
    maxOutputTokens: null,
  } as any;

  const result = validateConfidenceQuality(summary, cfg);
  assert.equal(result.pass, false);
  assert.equal(result.blockers.includes("confidence_raw_sample_missing"), true);
});

test("validateConfidenceQuality 会拒绝未达置信阈值", () => {
  const summary = makeSummary({ confidenceSource: "judge_coverage_inferred", confidenceRawUsed: false, qualityConfidence: 0.52 });
  const cfg = {
    enforceConfidence: true,
    minConfidence: 0.7,
    live: false,
    out: "",
    profile: "standard" as const,
    sessions: 1,
    steps: 1,
    maxLiveCalls: 60,
    judgeMode: "codex" as const,
    compareJudge: false,
    includePlan: false,
    skipQuality: false,
    skipPlaythrough: false,
    baseUrl: "",
    parallel: 1,
    requiredConfidenceSource: undefined,
    enforceCost: false,
    maxCostEquivalent: null,
    maxCostPerTurn: null,
    maxInputTokens: null,
    maxOutputTokens: null,
  } as any;

  const result = validateConfidenceQuality(summary, cfg);
  assert.equal(result.pass, false);
  assert.equal(result.blockers.includes("confidence_raw_sample_missing"), true);
  assert.equal(result.blockers.includes("confidence_threshold_not_met"), false);
});

test("validateBugRisk 不启用时通过", () => {
  const summary = makeSummary({
    bugLedger: [
      { fingerprint: "runtime:foo", cohortDisposition: "reproduced_current", status: "needs_triage", severity: "major", baselineCount: 0, currentCount: 1, currentActionableCount: 2 },
    ],
  });
  const cfg = {
    enforceBugGate: false,
    maxCriticalBugs: null,
    maxMajorBugs: null,
    maxMinorBugs: null,
    maxActionableBugs: null,
    maxActionableBugsPer100Turns: null,
    live: false,
    out: "",
    profile: "standard" as const,
    sessions: 1,
    steps: 1,
    maxLiveCalls: 60,
    judgeMode: "codex" as const,
    compareJudge: false,
    includePlan: false,
    skipQuality: false,
    skipPlaythrough: false,
    baseUrl: "",
    parallel: 1,
    enforceConfidence: false,
    minConfidence: 0,
    enforceCost: false,
    maxCostEquivalent: null,
    maxCostPerTurn: null,
    maxInputTokens: null,
    maxOutputTokens: null,
  } as any;

  const result = validateBugRisk(summary, cfg);
  assert.equal(result.pass, true);
  assert.equal(result.blockers.length, 0);
});

test("validateBugRisk 会阻止超限严重缺陷", () => {
  const summary = makeSummary({
    turns: 100,
    bugLedger: [
      { fingerprint: "runtime:major", cohortDisposition: "reproduced_current", status: "needs_triage", severity: "major", baselineCount: 0, currentCount: 5, currentActionableCount: 2 },
      { fingerprint: "runtime:minor", cohortDisposition: "guard_observed_current", status: "expected_guard_hit", severity: "minor", baselineCount: 0, currentCount: 1, currentActionableCount: 0 },
      { fingerprint: "validator:critical", cohortDisposition: "reproduced_current", status: "needs_triage", severity: "critical", baselineCount: 0, currentCount: 1, currentActionableCount: 1 },
    ],
  });
  const cfg = {
    enforceBugGate: true,
    maxCriticalBugs: 0,
    maxMajorBugs: 0,
    maxMinorBugs: 10,
    maxActionableBugs: 2,
    maxActionableBugsPer100Turns: 2,
    live: false,
    out: "",
    profile: "standard" as const,
    sessions: 1,
    steps: 1,
    maxLiveCalls: 60,
    judgeMode: "codex" as const,
    compareJudge: false,
    includePlan: false,
    skipQuality: false,
    skipPlaythrough: false,
    baseUrl: "",
    parallel: 1,
    enforceConfidence: false,
    minConfidence: 0,
    enforceCost: false,
    maxCostEquivalent: null,
    maxCostPerTurn: null,
    maxInputTokens: null,
    maxOutputTokens: null,
  } as any;

  const result = validateBugRisk(summary, cfg);
  assert.equal(result.pass, false);
  assert.equal(result.blockers.includes("critical_bug_count_exceeded"), true);
  assert.equal(result.blockers.includes("major_bug_count_exceeded"), true);
  assert.equal(result.blockers.includes("total_actionable_bug_count_exceeded"), true);
  assert.equal(result.blockers.includes("actionable_bug_rate_exceeded"), true);
});
