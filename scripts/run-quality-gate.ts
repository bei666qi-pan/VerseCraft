#!/usr/bin/env tsx
/**
 * End-to-end 质量闸道：长程评测 + 质量打分 + 缺陷提报。
 *
 * - 默认：mock 执行（不会调用真实模型）
 * - 使用 --live 开启真实 /api/chat
 * - 默认裁判：codex（离线，适合频繁执行）
 * - 自动生成：
 *   - live-playthrough-report.md / traces/*.json
 *   - product-quality.json / product-quality.md
 *   - next-feature-tests.json（adaptive 下一期测试建议）
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

type ConfidenceSource = "raw_ai" | "judge_coverage_inferred" | "heuristic_only";
type ConfidenceSourceRequirement = ConfidenceSource;

type BugLedgerSummaryRow = {
  fingerprint: string;
  cohortDisposition: string;
  status: string;
  severity: string;
  baselineCount: number;
  currentCount: number;
  currentActionableCount: number;
  currentRatePer100Turns: number | null;
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

type ParsedBooleanArg = { found: boolean; raw?: string; hasValue: boolean };
type ParsedNumericArg = { found: boolean; raw?: string; hasValue: boolean };

type ReportSummary = {
  qualityScore: number | null;
  qualityConfidence: number | null;
  blockers: string[];
  confidenceSource?: string | null;
  confidenceRawUsed?: boolean;
  confidenceComponents?: Array<{
    name: string;
    value: number;
    weight: number;
    note: string;
  }>;
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
  featureSignals: Record<string, FeatureDecisionSignalSummary>;
  bugLedger: BugLedgerSummaryRow[];
  bugRiskSummary?: BugRiskSummary;
};

type GateVerdictName =
  | "playthrough"
  | "product_quality"
  | "quality_gate"
  | "confidence_source"
  | "confidence_quality"
  | "cost"
  | "bug_risk";

type GateCheckResult = {
  gate: GateVerdictName;
  passed: boolean;
  blockers: string[];
  details?: string[];
};

type GateVerdict = {
  generatedAt: string;
  outDir: string;
  profile: GateConfig["profile"];
  sessions: number;
  steps: number;
  judgeMode: GateConfig["judgeMode"];
  checks: GateCheckResult[];
  blockers: string[];
  status: "pass" | "fail";
};

interface GateConfig {
  live: boolean;
  out: string;
  profile: "smoke" | "standard" | "deep";
  sessions: number;
  steps: number;
  scenarioIds?: string[];
  maxLiveCalls: number;
  judgeMode: "auto" | "mock" | "live" | "codex";
  compareJudge: boolean;
  includePlan: boolean;
  skipQuality: boolean;
  skipPlaythrough: boolean;
  baseUrl: string;
  parallel?: number;
  continueOnDegrade?: boolean;
  enforceConfidence: boolean;
  minConfidence: number;
  requiredConfidenceSource?: ConfidenceSourceRequirement;
  enforceCost: boolean;
  maxCostEquivalent: number | null;
  maxCostPerTurn: number | null;
  maxInputTokens: number | null;
  maxOutputTokens: number | null;
  enforceBugGate: boolean;
  maxCriticalBugs: number | null;
  maxMajorBugs: number | null;
  maxMinorBugs: number | null;
  maxActionableBugs: number | null;
  maxActionableBugsPer100Turns: number | null;
}

interface FeatureDecisionSignalSummary {
  touchedTurns: number;
  progressionTurns: number;
  contributionRate: number | null;
  decision: string;
  confidence: number;
  interval?: { lower: number; upper: number } | null;
  rationale?: string[];
  evidenceLabel?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function writeGateResult(path: string, result: GateVerdict): Promise<void> {
  return writeFile(path, JSON.stringify(result, null, 2), "utf8");
}

function parseBooleanRaw(raw: string | undefined): boolean | undefined {
  if (raw == null) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function parseBooleanArg(args: string[], name: string): ParsedBooleanArg {
  const prefix = `${name}=`;
  const inlineIndex = args.findIndex((arg) => arg === name);
  if (inlineIndex >= 0) {
    const value = args[inlineIndex + 1];
    if (value == null || value.startsWith("-")) return { found: true, hasValue: false };
    return { found: true, raw: value, hasValue: true };
  }

  const kv = args.find((arg) => arg.startsWith(prefix));
  if (kv) {
    return { found: true, raw: kv.slice(prefix.length), hasValue: true };
  }

  return { found: false, hasValue: false };
}

function parseNumericArg(args: string[], name: string): ParsedNumericArg {
  const prefix = `${name}=`;
  const inlineIndex = args.findIndex((arg) => arg === name);
  if (inlineIndex >= 0) {
    const value = args[inlineIndex + 1];
    if (value == null || value.startsWith("-")) return { found: true, hasValue: false };
    return { found: true, raw: value, hasValue: true };
  }

  const kv = args.find((arg) => arg.startsWith(prefix));
  if (kv) {
    return { found: true, raw: kv.slice(prefix.length), hasValue: true };
  }

  return { found: false, hasValue: false };
}

function parseSafePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw == null) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) return fallback;
  return value;
}

function parseSafeInt(raw: string | undefined, fallback: number): number {
  if (raw == null) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return fallback;
  return value;
}

function parseSafeFloat(raw: string | undefined, fallback: number): number {
  if (raw == null) return fallback;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return fallback;
  return value;
}

function parseSafeNumberOrNull(raw: string | undefined): number | null {
  if (raw == null) return null;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

function parseSafePositiveIntOrNull(raw: string | undefined): number | null {
  if (raw == null) return null;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

function parseBooleanArgValue(args: string[], name: string, noValueDefault: boolean): boolean | undefined {
  const parsed = parseBooleanArg(args, name);
  if (!parsed.found) return undefined;
  if (!parsed.hasValue) return noValueDefault;
  const parsedValue = parseBooleanRaw(parsed.raw);
  return parsedValue === undefined ? noValueDefault : parsedValue;
}

function parseSkipPlaythrough(args: string[]): boolean {
  return parseBooleanArgValue(args, "--skip-playthrough", true) ?? false;
}

function parseSkipQuality(args: string[]): boolean {
  return parseBooleanArgValue(args, "--skip-quality", true) ?? false;
}

function parseSkipPlan(args: string[]): boolean {
  return parseBooleanArgValue(args, "--skip-plan", true) ?? false;
}

function parseCompareJudge(args: string[]): boolean {
  return parseBooleanArgValue(args, "--compare-judge", true) ?? (process.env.VERSECRAFT_EVAL_COMPARE_JUDGE === "1");
}

function parseContinueOnDegrade(args: string[]): boolean | undefined {
  const continueValue = parseBooleanArgValue(args, "--continue-on-degrade", true);
  if (continueValue !== undefined) return continueValue;

  const stopValue = parseBooleanArgValue(args, "--stop-on-degrade", true);
  if (stopValue === undefined) return undefined;
  return stopValue ? false : undefined;
}

function parseConfidenceGate(args: string[]): { enabled: boolean; threshold: number } {
  const enforce = parseBooleanArgValue(args, "--enforce-confidence", true) ?? false;
  if (!enforce) return { enabled: false, threshold: 0 };
  const inline = parseBooleanArg(args, "--min-confidence");
  const fallback = parseSafeFloat(process.env.VERSECRAFT_EVAL_MIN_CONFIDENCE, 0.7);
  const threshold = parseSafeFloat(inline.hasValue ? inline.raw : undefined, fallback);
  return { enabled: true, threshold: Math.max(0, Math.min(1, threshold)) };
}

function parseConfidenceSourceRequirement(args: string[]): ConfidenceSourceRequirement | undefined {
  const parsed = parseNumericArg(args, "--require-confidence-source");
  const source = (parsed.hasValue ? parsed.raw : process.env.VERSECRAFT_EVAL_REQUIRE_CONFIDENCE_SOURCE)?.trim();
  if (!source) return undefined;
  if (source === "raw_ai" || source === "judge_coverage_inferred" || source === "heuristic_only") {
    return source;
  }
  return undefined;
}

function resolveConfidenceSourceRequirement(args: string[], enforceConfidence: boolean): ConfidenceSourceRequirement | undefined {
  const explicit = parseConfidenceSourceRequirement(args);
  if (!enforceConfidence) return explicit;
  return explicit ?? "raw_ai";
}

function parseBugGate(args: string[]): {
  enforceBugGate: boolean;
  maxCriticalBugs: number | null;
  maxMajorBugs: number | null;
  maxMinorBugs: number | null;
  maxActionableBugs: number | null;
  maxActionableBugsPer100Turns: number | null;
} {
  const enforce = parseBooleanArgValue(args, "--enforce-bug-gate", true) ?? false;
  if (!enforce) {
    return {
      enforceBugGate: false,
      maxCriticalBugs: null,
      maxMajorBugs: null,
      maxMinorBugs: null,
      maxActionableBugs: null,
      maxActionableBugsPer100Turns: null,
    };
  }

  const parseLimit = (name: string, envName: string): number | null => {
    const parsed = parseNumericArg(args, name);
    const raw = parsed.hasValue ? parsed.raw : process.env[envName];
    return parseSafePositiveIntOrNull(raw);
  };

  const parseRateLimit = (name: string, envName: string): number | null => {
    const parsed = parseNumericArg(args, name);
    const raw = parsed.hasValue ? parsed.raw : process.env[envName];
    return parseSafeNumberOrNull(raw);
  };

  return {
    enforceBugGate: true,
    maxCriticalBugs: parseLimit("--max-critical-bugs", "VERSECRAFT_EVAL_MAX_CRITICAL_BUGS"),
    maxMajorBugs: parseLimit("--max-major-bugs", "VERSECRAFT_EVAL_MAX_MAJOR_BUGS"),
    maxMinorBugs: parseLimit("--max-minor-bugs", "VERSECRAFT_EVAL_MAX_MINOR_BUGS"),
    maxActionableBugs: parseLimit("--max-actionable-bugs", "VERSECRAFT_EVAL_MAX_ACTIONABLE_BUGS"),
    maxActionableBugsPer100Turns: parseRateLimit("--max-actionable-bugs-per-100-turns", "VERSECRAFT_EVAL_MAX_ACTIONABLE_BUG_RATE_PER_100_TURNS"),
  };
}

function parseCostGate(args: string[]): {
  enforceCost: boolean;
  maxCostEquivalent: number | null;
  maxCostPerTurn: number | null;
  maxInputTokens: number | null;
  maxOutputTokens: number | null;
} {
  const enforce = parseBooleanArgValue(args, "--enforce-cost", true) ?? false;
  if (!enforce) {
    return {
      enforceCost: false,
      maxCostEquivalent: null,
      maxCostPerTurn: null,
      maxInputTokens: null,
      maxOutputTokens: null,
    };
  }

  const parseBudgetArg = (name: string, envName: string): number | null => {
    const parsed = parseNumericArg(args, name);
    const raw = parsed.hasValue ? parsed.raw : process.env[envName];
    return raw ? parseSafeNumberOrNull(raw) : null;
  };

  return {
    enforceCost: true,
    maxCostEquivalent: parseBudgetArg("--max-cost-equivalent", "VERSECRAFT_EVAL_MAX_COST_EQ"),
    maxCostPerTurn: parseBudgetArg("--max-cost-per-turn", "VERSECRAFT_EVAL_MAX_COST_PER_TURN"),
    maxInputTokens: parseBudgetArg("--max-input-tokens", "VERSECRAFT_EVAL_MAX_INPUT_TOKENS"),
    maxOutputTokens: parseBudgetArg("--max-output-tokens", "VERSECRAFT_EVAL_MAX_OUTPUT_TOKENS"),
  };
}

function parseArgs(): GateConfig {
  const args = process.argv.slice(2);
  const read = (name: string, fallback: string) => {
    const idx = args.indexOf(name);
    return idx >= 0 ? args[idx + 1] : fallback;
  };
  const has = (name: string) => args.includes(name);
  const profile = read("--profile", "standard") as GateConfig["profile"];
  const judgeMode = (read("--judge-mode", "codex") as GateConfig["judgeMode"]) ?? "codex";
  const confidenceEnforceArg = parseBooleanArg(args, "--enforce-confidence");
  const isConfidenceArgExplicit = confidenceEnforceArg.found;
  const autoConfidenceEnforcementEnabled = parseBooleanRaw(process.env.VERSECRAFT_EVAL_AUTO_REQUIRE_RAW_AI_CONFIDENCE) ?? true;
  const autoConfidenceEnforcement = autoConfidenceEnforcementEnabled && (judgeMode === "live" || judgeMode === "codex");

  const defaultOut = (() => {
    const now = new Date().toISOString().replace(/[.:]/g, "-");
    return resolve(`.runtime-data/eval/quality-gate-${now}`);
  })();

  const costGate = parseCostGate(args);
  const confidenceGate = parseConfidenceGate(args);
  const enforceConfidence = isConfidenceArgExplicit ? confidenceGate.enabled : autoConfidenceEnforcement;
  const requiredConfidenceSource = resolveConfidenceSourceRequirement(args, enforceConfidence);
  const bugGate = parseBugGate(args);

  return {
    live: has("--live"),
    out: resolve(read("--out", defaultOut)),
    profile: profile === "smoke" || profile === "deep" ? profile : "standard",
    sessions: parseSafePositiveInt(read("--sessions", profile === "deep" ? "6" : "3"), profile === "deep" ? 6 : 3),
    steps: parseSafePositiveInt(read("--steps", "12"), 12),
    scenarioIds: read("--scenarios", "").split(",").map((id) => id.trim()).filter(Boolean),
    maxLiveCalls: parseSafeInt(read("--max-live-calls", process.env.VERSECRAFT_EVAL_RUN_CALL_BUDGET ?? "60"), 60),
    judgeMode: judgeMode === "mock" || judgeMode === "live" || judgeMode === "auto" || judgeMode === "codex" ? judgeMode : "codex",
    compareJudge: parseCompareJudge(args),
    includePlan: !parseSkipPlan(args),
    skipQuality: parseSkipQuality(args),
    skipPlaythrough: parseSkipPlaythrough(args),
    baseUrl: read("--base-url", process.env.LIVEPLAY_BASE_URL ?? "http://127.0.0.1:666"),
    parallel: parseSafePositiveInt(read("--parallel", process.env.VERSECRAFT_EVAL_PARALLEL_SESSIONS ?? "1"), 1),
    continueOnDegrade: parseContinueOnDegrade(args),
    enforceConfidence,
    minConfidence: confidenceGate.threshold,
    requiredConfidenceSource,
    ...costGate,
    ...bugGate,
  };
}

function spawnScript(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolveProc) => {
    let stdout = "";
    let stderr = "";
    const child = spawn("pnpm", ["exec", "tsx", cmd, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text);
      stdout += text;
    });
    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      process.stderr.write(text);
      stderr += text;
    });
    child.on("close", (code) => resolveProc({
      code: typeof code === "number" ? code : 1,
      stdout,
      stderr,
    }));
    child.on("error", (error) => {
      stderr += String(error instanceof Error ? error.message : error);
      resolveProc({ code: 1, stdout, stderr });
    });
  });
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const data = await readFile(path, "utf8");
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

async function readReport(path: string): Promise<ReportSummary | null> {
  const report = await readJson<{
    scorecard?: {
      overallScore: number | null;
      blockers?: string[];
      confidence?: number;
      confidenceTrace?: {
        source: ConfidenceSource;
        rawEvidenceUsed: boolean;
        confidenceFloor: number;
        evidenceComponents?: Array<{ name: string; value: number; weight: number; note: string }>;
      };
    };
    turns?: number;
    signals?: {
      tokenInput?: number | null;
      tokenOutput?: number | null;
      tokenCachedInput?: number | null;
      tokenCostEquivalent?: number | null;
      tokenCostProfile?: string | null;
      tokenCoveredTurns?: number;
      tokenCoverageRate?: number;
    };
    bugLedger?: Array<{
      fingerprint: string;
      cohortDisposition: string;
      status: string;
      severity: string;
      baselineCount?: number;
      currentCount?: number;
      currentActionableCount?: number;
      currentRatePer100Turns?: number | null;
      count?: number;
      currentRunIds?: unknown;
    }>;
    bugRiskSummary?: {
      totalRows?: number;
      totalActionableBugs?: number;
      criticalActionableBugs?: number;
      majorActionableBugs?: number;
      minorActionableBugs?: number;
      guardObservedRowsCurrent?: number;
      reproducedRowsCurrent?: number;
      topActionableFingerprints?: string[];
      actionableRatePer100Turns?: number | null;
    };
    turnDiagnostics?: Array<{ runId: string; stepIndex: number | string; flags: string[]; action: string; latencyMs: number | null }>;
    featureSignals?: Record<string, {
      touchedTurns: number;
      progressionTurns: number;
      decision: string;
      confidence?: number;
      interval?: { lower: number; upper: number } | null;
      rationale?: string[];
      evidenceLabel?: string;
    }>;
  }>(path);

  if (!report) return null;

  return {
    qualityScore: report.scorecard?.overallScore ?? null,
    qualityConfidence: report.scorecard?.confidence ?? null,
    confidenceSource: report.scorecard?.confidenceTrace?.source ?? null,
    confidenceRawUsed: report.scorecard?.confidenceTrace?.rawEvidenceUsed,
    confidenceComponents: report.scorecard?.confidenceTrace?.evidenceComponents?.slice(0, 4),
    confidenceFloor: report.scorecard?.confidenceTrace?.confidenceFloor,
    blockers: report.scorecard?.blockers ?? [],
    tokenInput: report.signals?.tokenInput ?? null,
    tokenOutput: report.signals?.tokenOutput ?? null,
    tokenCachedInput: report.signals?.tokenCachedInput ?? null,
    tokenCostEquivalent: report.signals?.tokenCostEquivalent ?? null,
    tokenCostProfile: report.signals?.tokenCostProfile ?? null,
    tokenCoveredTurns: report.signals?.tokenCoveredTurns ?? 0,
    tokenCoverageRate: report.signals?.tokenCoverageRate ?? 0,
    turns: typeof report.turns === "number" ? report.turns : undefined,
    turnDiagnostics: (report.turnDiagnostics ?? []).filter((row) => row.flags.length > 0).slice(0, 12),
    featureSignals: report.featureSignals ?? {},
    bugLedger: (report.bugLedger ?? []).map((row) => ({
      fingerprint: row.fingerprint,
      cohortDisposition: row.cohortDisposition,
      status: row.status,
      severity: row.severity,
      baselineCount: Number.isFinite(row.baselineCount) ? Math.max(0, Math.round(row.baselineCount)) : 0,
      currentCount: Number.isFinite(row.currentCount) ? Math.max(0, Math.round(row.currentCount)) : 0,
      currentActionableCount: Number.isFinite(row.currentActionableCount) ? Math.max(0, Math.round(row.currentActionableCount)) : 0,
      currentRatePer100Turns: Number.isFinite(row.currentRatePer100Turns as number | undefined) ? (row.currentRatePer100Turns as number) : null,
    })),
    bugRiskSummary: report.bugRiskSummary == null ? undefined : {
      totalRows: Number.isFinite(report.bugRiskSummary.totalRows) ? Math.max(0, Math.round(report.bugRiskSummary.totalRows)) : 0,
      totalActionableBugs: Number.isFinite(report.bugRiskSummary.totalActionableBugs) ? Math.max(0, Math.round(report.bugRiskSummary.totalActionableBugs)) : 0,
      criticalActionableBugs: Number.isFinite(report.bugRiskSummary.criticalActionableBugs) ? Math.max(0, Math.round(report.bugRiskSummary.criticalActionableBugs)) : 0,
      majorActionableBugs: Number.isFinite(report.bugRiskSummary.majorActionableBugs) ? Math.max(0, Math.round(report.bugRiskSummary.majorActionableBugs)) : 0,
      minorActionableBugs: Number.isFinite(report.bugRiskSummary.minorActionableBugs) ? Math.max(0, Math.round(report.bugRiskSummary.minorActionableBugs)) : 0,
      reproducedRowsCurrent: Number.isFinite(report.bugRiskSummary.reproducedRowsCurrent) ? Math.max(0, Math.round(report.bugRiskSummary.reproducedRowsCurrent)) : 0,
      guardObservedRowsCurrent: Number.isFinite(report.bugRiskSummary.guardObservedRowsCurrent) ? Math.max(0, Math.round(report.bugRiskSummary.guardObservedRowsCurrent)) : 0,
      topActionableFingerprints: Array.isArray(report.bugRiskSummary.topActionableFingerprints) ? report.bugRiskSummary.topActionableFingerprints.slice(0, 10).map(String) : [],
      actionableRatePer100Turns: Number.isFinite(report.bugRiskSummary.actionableRatePer100Turns as number | undefined | null)
        ? (report.bugRiskSummary.actionableRatePer100Turns as number)
        : null,
    },
  };
}

function summarizeBugRisk(summary: Pick<ReportSummary, "bugLedger" | "turns">): BugRiskSummary {
  const rows = summary.bugLedger ?? [];
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

  const turns = typeof summary.turns === "number" ? Math.max(0, summary.turns) : 0;
  const actionableRatePer100Turns = turns > 0 ? (totalActionableBugs / turns) * 100 : null;

  return {
    totalRows: rows.length,
    totalActionableBugs,
    criticalActionableBugs,
    majorActionableBugs,
    minorActionableBugs,
    guardObservedRowsCurrent,
    reproducedRowsCurrent,
    topActionableFingerprints,
    actionableRatePer100Turns: safeRate(actionableRatePer100Turns),
  };
}

function round2(value: number | null | undefined): string {
  if (!Number.isFinite(Number(value))) return "n/a";
  return Number(value).toFixed(2);
}

function percent(value: number | null | undefined): string {
  if (!Number.isFinite(Number(value))) return "n/a";
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function validateCostConstraints(summary: ReportSummary | null, cfg: GateConfig): { pass: boolean; blockers: string[]; messages: string[] } {
  if (!cfg.enforceCost) {
    return { pass: true, blockers: [], messages: [] };
  }

  if (summary == null) {
    return {
      pass: false,
      blockers: ["missing_product_quality_summary"],
      messages: ["缺少 product-quality.json，无法执行成本门禁。"],
    };
  }

  const blockers: string[] = [];
  const messages: string[] = [];

  const coveredTurns = summary.tokenCoveredTurns ?? 0;
  const coverageRate = summary.tokenCoverageRate ?? 0;
  const costEquivalent = summary.tokenCostEquivalent;
  const costPerCoveredTurn = coveredTurns > 0 && typeof costEquivalent === "number" ? costEquivalent / coveredTurns : null;

  if (!Number.isFinite(costEquivalent as number | undefined)) {
    blockers.push("cost_evidence_missing");
    messages.push("未检测到成本当量证据，无法执行成本门禁。请确认 trace 有 _eval_metrics。");
  }

  if (!Number.isFinite(coverageRate) || coverageRate < 0.9) {
    blockers.push("insufficient_cost_evidence");
    messages.push(`token 证据覆盖率不足：${percent(coverageRate)}（要求 ≥ 90.0%）。`);
  }

  if (cfg.maxCostEquivalent !== null && typeof costEquivalent === "number" && costEquivalent > cfg.maxCostEquivalent) {
    blockers.push("cost_equivalent_exceeded");
    messages.push(`总成本当量超限：${formatMoney(costEquivalent)} > ${formatMoney(cfg.maxCostEquivalent)}。`);
  }

  if (cfg.maxCostPerTurn !== null && typeof costPerCoveredTurn === "number" && costPerCoveredTurn > cfg.maxCostPerTurn) {
    blockers.push("cost_per_turn_exceeded");
    messages.push(`每回合成本当量超限：${formatMoney(costPerCoveredTurn)} > ${formatMoney(cfg.maxCostPerTurn)}。`);
  }

  if (cfg.maxInputTokens !== null && typeof summary.tokenInput === "number" && summary.tokenInput > cfg.maxInputTokens) {
    blockers.push("input_token_budget_exceeded");
    messages.push(`输入 token 超限：${Math.round(summary.tokenInput)} > ${Math.round(cfg.maxInputTokens)}。`);
  }

  if (cfg.maxOutputTokens !== null && typeof summary.tokenOutput === "number" && summary.tokenOutput > cfg.maxOutputTokens) {
    blockers.push("output_token_budget_exceeded");
    messages.push(`输出 token 超限：${Math.round(summary.tokenOutput)} > ${Math.round(cfg.maxOutputTokens)}。`);
  }

  const cachedInput = summary.tokenCachedInput;
  const totalInput = summary.tokenInput;
  if (typeof cachedInput === "number" && typeof totalInput === "number" && totalInput > 0) {
    const cacheRate = cachedInput / totalInput;
    messages.push(`cache 覆盖率=${percent(cacheRate)}，已覆盖输入=${Math.round(cachedInput)}/${Math.round(totalInput)}。`);
  }

  if (typeof costEquivalent === "number") {
    messages.push(`成本当量=${formatMoney(costEquivalent)}（profile=${summary.tokenCostProfile ?? "n/a"}，有效回合=${coveredTurns}/${summary.turns ?? "?"}）。`);
  }
  if (costPerCoveredTurn !== null) {
    messages.push(`每回合成本当量=${formatMoney(costPerCoveredTurn)}。`);
  }

  return { pass: blockers.length === 0, blockers, messages };
}

function validateConfidenceSource(summary: ReportSummary | null, cfg: GateConfig): { pass: boolean; blockers: string[] } {
  if (!cfg.requiredConfidenceSource) {
    return { pass: true, blockers: [] };
  }

  if (summary == null || summary.confidenceSource == null) {
    return { pass: false, blockers: ["confidence_source_missing"] };
  }

  return summary.confidenceSource === cfg.requiredConfidenceSource
    ? { pass: true, blockers: [] }
    : { pass: false, blockers: ["confidence_source_mismatch"] };
}

function validateConfidenceQuality(summary: ReportSummary | null, cfg: GateConfig): { pass: boolean; blockers: string[] } {
  if (!cfg.enforceConfidence) {
    return { pass: true, blockers: [] };
  }

  if (summary == null) {
    return { pass: false, blockers: ["confidence_summary_missing"] };
  }

  if (summary.confidenceSource == null) {
    return { pass: false, blockers: ["confidence_source_missing"] };
  }

  if (summary.confidenceSource === "heuristic_only") {
    return { pass: false, blockers: ["confidence_source_too_weak"] };
  }

  if (summary.confidenceSource === "judge_coverage_inferred" && summary.confidenceRawUsed !== true) {
    return { pass: false, blockers: ["confidence_raw_sample_missing"] };
  }

  if (summary.qualityConfidence === null) {
    return { pass: false, blockers: ["confidence_value_missing"] };
  }

  if (summary.qualityConfidence < cfg.minConfidence) {
    return { pass: false, blockers: ["confidence_threshold_not_met"] };
  }

  return { pass: true, blockers: [] };
}

function validateBugRisk(summary: ReportSummary | null, cfg: GateConfig): { pass: boolean; blockers: string[]; details: string[] } {
  if (!cfg.enforceBugGate) {
    return { pass: true, blockers: [], details: ["未启用缺陷门禁（--enforce-bug-gate）。"] };
  }

  if (summary == null) {
    return { pass: false, blockers: ["missing_product_quality_summary"], details: ["缺少 product-quality.json，无法执行缺陷风险门禁。"] };
  }

  const bugRisk = summary.bugRiskSummary ?? summarizeBugRisk(summary);
  const blockers: string[] = [];
  const details: string[] = [
    `可动作缺陷数=${bugRisk.totalActionableBugs}（critical=${bugRisk.criticalActionableBugs} / major=${bugRisk.majorActionableBugs} / minor=${bugRisk.minorActionableBugs}）`,
    `风险分型=${bugRisk.totalRows}（reproduced=${bugRisk.reproducedRowsCurrent} / guardObserved=${bugRisk.guardObservedRowsCurrent}）`,
    `每100回合可动作缺陷率=${bugRisk.actionableRatePer100Turns === null ? "n/a" : `${round2(bugRisk.actionableRatePer100Turns)}`}`,
  ];

  if (cfg.maxCriticalBugs !== null && bugRisk.criticalActionableBugs > cfg.maxCriticalBugs) {
    blockers.push("critical_bug_count_exceeded");
    details.push(`critical 门禁超限：${bugRisk.criticalActionableBugs} > ${cfg.maxCriticalBugs}`);
  }

  if (cfg.maxMajorBugs !== null && bugRisk.majorActionableBugs > cfg.maxMajorBugs) {
    blockers.push("major_bug_count_exceeded");
    details.push(`major 门禁超限：${bugRisk.majorActionableBugs} > ${cfg.maxMajorBugs}`);
  }

  if (cfg.maxMinorBugs !== null && bugRisk.minorActionableBugs > cfg.maxMinorBugs) {
    blockers.push("minor_bug_count_exceeded");
    details.push(`minor 门禁超限：${bugRisk.minorActionableBugs} > ${cfg.maxMinorBugs}`);
  }

  if (cfg.maxActionableBugs !== null && bugRisk.totalActionableBugs > cfg.maxActionableBugs) {
    blockers.push("total_actionable_bug_count_exceeded");
    details.push(`可动作缺陷总数超限：${bugRisk.totalActionableBugs} > ${cfg.maxActionableBugs}`);
  }

  if (cfg.maxActionableBugsPer100Turns !== null && bugRisk.actionableRatePer100Turns !== null && bugRisk.actionableRatePer100Turns > cfg.maxActionableBugsPer100Turns) {
    blockers.push("actionable_bug_rate_exceeded");
    details.push(`可动作缺陷率超限：${round2(bugRisk.actionableRatePer100Turns)} > ${round2(cfg.maxActionableBugsPer100Turns)} /100回合`);
  }

  return {
    pass: blockers.length === 0,
    blockers,
    details,
  };
}

function collectChecks(
  cfg: GateConfig,
  summary: ReportSummary | null,
  qualityCheck: ReturnType<typeof validateCostConstraints>,
  confidenceSourceCheck: ReturnType<typeof validateConfidenceSource>,
  confidenceQualityCheck: ReturnType<typeof validateConfidenceQuality>,
  bugRiskCheck: ReturnType<typeof validateBugRisk>,
): GateCheckResult[] {
  const checks: GateCheckResult[] = [
    {
      gate: "playthrough",
      passed: summary != null,
      blockers: summary == null ? ["quality_report_missing"] : [],
    },
    {
      gate: "product_quality",
      passed: summary != null && summary.blockers.length === 0,
      blockers: summary?.blockers ?? [],
      details: summary == null ? [] : summary.blockers,
    },
    {
      gate: "cost",
      passed: qualityCheck.pass,
      blockers: qualityCheck.blockers,
      details: qualityCheck.messages,
    },
    {
      gate: "bug_risk",
      passed: bugRiskCheck.pass,
      blockers: bugRiskCheck.blockers,
      details: bugRiskCheck.details,
    },
    {
      gate: "confidence_source",
      passed: confidenceSourceCheck.pass,
      blockers: confidenceSourceCheck.blockers,
    },
    {
      gate: "confidence_quality",
      passed: confidenceQualityCheck.pass,
      blockers: confidenceQualityCheck.blockers,
    },
    {
      gate: "quality_gate",
      passed: summary != null && (!cfg.enforceConfidence || (
        summary.qualityConfidence !== null &&
        summary.qualityConfidence >= cfg.minConfidence &&
        summary.confidenceSource !== "heuristic_only"
      )),
      blockers: [],
      details: [
        `enforceConfidence=${cfg.enforceConfidence}`,
        `minConfidence=${cfg.minConfidence.toFixed(2)}`,
        `confidence=${summary?.qualityConfidence == null ? "null" : `${(summary.qualityConfidence * 100).toFixed(1)}%`}`,
        `confidenceSource=${summary?.confidenceSource ?? "missing"}`,
      ],
    },
  ];

  // 保证没有不一致状态：若 scorecard 自身未评分且我们启用置信门禁，按 conf 门禁失败。
  if (cfg.enforceConfidence && summary != null && summary.qualityConfidence === null) {
    checks.find((item) => item.gate === "quality_gate")!.pass = false;
    checks.find((item) => item.gate === "confidence_quality")!.blockers = ["confidence_value_missing"];
    checks.find((item) => item.gate === "confidence_quality")!.passed = false;
  }

  if (cfg.requiredConfidenceSource != null) {
    checks.find((item) => item.gate === "confidence_source")!.passed = confidenceSourceCheck.pass;
    checks.find((item) => item.gate === "confidence_source")!.blockers = confidenceSourceCheck.blockers;
  }

  return checks;
}

function buildGateVerdict(
  cfg: GateConfig,
  summary: ReportSummary | null,
  qualityCheck: ReturnType<typeof validateCostConstraints>,
  confidenceSourceCheck: ReturnType<typeof validateConfidenceSource>,
  confidenceQualityCheck: ReturnType<typeof validateConfidenceQuality>,
  bugRiskCheck: ReturnType<typeof validateBugRisk>,
): GateVerdict {
  const checks = collectChecks(cfg, summary, qualityCheck, confidenceSourceCheck, confidenceQualityCheck, bugRiskCheck);
  const blockers = checks.flatMap((check) => check.blockers);
  return {
    generatedAt: nowIso(),
    outDir: cfg.out,
    profile: cfg.profile,
    sessions: cfg.sessions,
    steps: cfg.steps,
    judgeMode: cfg.judgeMode,
    checks,
    blockers: Array.from(new Set(blockers)),
    status: blockers.length === 0 ? "pass" : "fail",
  };
}

function formatMoney(value: number | null | undefined): string {
  if (!Number.isFinite(Number(value))) return "n/a";
  return round2(Number(value));
}

async function run() {
  const cfg = parseArgs();
  await mkdir(cfg.out, { recursive: true });
  const gateResultPath = resolve(cfg.out, "quality-gate-result.json");
  const runArgs: string[] = [];

  if (cfg.live) runArgs.push("--live");
  if (cfg.compareJudge) runArgs.push("--compare-judge");
  runArgs.push("--judge-mode", cfg.judgeMode);
  runArgs.push("--profile", cfg.profile);
  runArgs.push("--sessions", String(cfg.sessions));
  runArgs.push("--max-steps", String(cfg.steps));
  if (cfg.parallel && cfg.parallel > 1) runArgs.push("--parallel", String(cfg.parallel));
  if (cfg.continueOnDegrade === true) runArgs.push("--continue-on-degrade");
  if (cfg.continueOnDegrade === false) runArgs.push("--stop-on-degrade");
  if (cfg.scenarioIds && cfg.scenarioIds.length > 0) runArgs.push("--scenarios", cfg.scenarioIds.join(","));
  runArgs.push("--max-live-calls", String(cfg.maxLiveCalls));
  runArgs.push("--out", cfg.out);
  runArgs.push("--base-url", cfg.baseUrl);

  const tracesDir = resolve(cfg.out, "traces");

  if (!cfg.skipPlaythrough) {
    console.log("\n==> 运行 playthrough 质量回放");
    const ret = await spawnScript("scripts/eval-playthrough-live.ts", runArgs);
    if (ret.code !== 0) {
      console.error(`playthrough 运行失败，code=${ret.code}`);
      await writeGateResult(gateResultPath, buildGateVerdict(
        cfg,
        null,
        { pass: false, blockers: ["playthrough_failed"], messages: ["playthrough 未通过"] },
        { pass: false, blockers: ["playthrough_failed"] },
        { pass: false, blockers: ["playthrough_failed"] },
        validateBugRisk(null, cfg),
      ));
      process.exitCode = ret.code;
      return;
    }
  }

  if (cfg.skipQuality) {
    console.log("跳过质量聚合（--skip-quality）。请手动调用 scripts/report-product-quality.ts");
    await writeGateResult(gateResultPath, buildGateVerdict(
      cfg,
      null,
      { pass: false, blockers: ["quality_aggregation_skipped"], messages: ["--skip-quality 已开启"] },
      { pass: false, blockers: ["quality_aggregation_skipped"] },
      { pass: false, blockers: ["quality_aggregation_skipped"] },
      validateBugRisk(null, cfg),
    ));
    return;
  }

  const qualityOut = resolve(cfg.out, "product-quality");
  await mkdir(qualityOut, { recursive: true });
  const qualityJson = resolve(qualityOut, "product-quality.json");
  const qualityMarkdown = resolve(qualityOut, "product-quality.md");

  if (!existsSync(tracesDir)) {
    console.error(`缺少 traces 目录：${tracesDir}`);
    await writeGateResult(gateResultPath, buildGateVerdict(
      cfg,
      null,
      { pass: false, blockers: ["traces_missing"], messages: [`缺少 traces 目录：${tracesDir}`] },
      { pass: false, blockers: ["traces_missing"] },
      { pass: false, blockers: ["traces_missing"] },
      validateBugRisk(null, cfg),
    ));
    process.exitCode = 1;
    return;
  }

  console.log("\n==> 生成产品质量聚合");
  const qualityArgs = [
    "--current-input", tracesDir,
    "--input", tracesDir,
    "--out", qualityJson,
    "--md-out", qualityMarkdown,
  ];

  const qualityRet = await spawnScript("scripts/report-product-quality.ts", qualityArgs);
  if (qualityRet.code !== 0) {
    console.error(`质量聚合失败，code=${qualityRet.code}`);
    await writeGateResult(gateResultPath, buildGateVerdict(
      cfg,
      null,
      { pass: false, blockers: ["quality_report_generation_failed"], messages: ["report-product-quality.ts 执行失败"] },
      { pass: false, blockers: ["quality_report_generation_failed"] },
      { pass: false, blockers: ["quality_report_generation_failed"] },
      validateBugRisk(null, cfg),
    ));
    process.exitCode = qualityRet.code;
    return;
  }

  const summary = await readReport(qualityJson);
  const qualityCheck = validateCostConstraints(summary, cfg);
  let confidenceSourceCheck = validateConfidenceSource(summary, cfg);
  let confidenceQualityCheck = validateConfidenceQuality(summary, cfg);
  let bugRiskCheck = validateBugRisk(summary, cfg);

  if (summary && summary.bugRiskSummary == null) {
    summary.bugRiskSummary = summarizeBugRisk(summary);
    bugRiskCheck = validateBugRisk(summary, cfg);
  }

  if (summary) {
    console.log("\n==> 聚合摘要");

    const scoreText = summary.qualityScore === null ? "未评分（证据不足）" : `${summary.qualityScore.toFixed(2)}/100`;
    console.log(`质量分：${scoreText}`);
    if (summary.qualityConfidence !== null) {
      console.log(`置信度：${(summary.qualityConfidence * 100).toFixed(1)}%`);
    } else {
      console.log("置信度：未计算（缺少 scorecard）");
    }

    if (summary.confidenceSource) {
      console.log(`置信来源：${summary.confidenceSource}，原始AI/Codex置信是否有用=${summary.confidenceRawUsed ? "是" : "否"}${typeof summary.confidenceFloor === "number" ? `，证据地板=${(summary.confidenceFloor * 100).toFixed(0)}%` : ""}`);
      if (summary.confidenceComponents && summary.confidenceComponents.length > 0) {
        console.log("置信成分（权重已归一）:");
        for (const component of summary.confidenceComponents) {
          console.log(`- ${component.name}: value=${component.value.toFixed(3)} weight=${component.weight.toFixed(3)} note=${component.note}`);
        }
      }
    }

    if (summary.blockers.length > 0) {
      console.log(`阻塞项：${summary.blockers.join("，")}`);
    } else {
      console.log("阻塞项：无");
    }

    console.log("成本摘要：");
    console.log(`- token覆盖率=${percent(summary.tokenCoverageRate)}（coveredTurns=${summary.tokenCoveredTurns ?? 0}）`);
    console.log(`- inputTokens=${summary.tokenInput ?? "n/a"}，outputTokens=${summary.tokenOutput ?? "n/a"}，cachedInput=${summary.tokenCachedInput ?? "n/a"}`);
    const costPerCoveredTurn = typeof summary.tokenCostEquivalent === "number" && (summary.tokenCoveredTurns ?? 0) > 0
      ? summary.tokenCostEquivalent / summary.tokenCoveredTurns
      : null;
    console.log(`- 成本当量=${summary.tokenCostEquivalent ?? "n/a"}，每回合约=${costPerCoveredTurn === null ? "n/a" : formatMoney(costPerCoveredTurn)}，profile=${summary.tokenCostProfile ?? "n/a"}`);

    if (summary.turnDiagnostics.length > 0) {
      console.log("Top 回合问题：");
      for (const row of summary.turnDiagnostics) {
        console.log(`- ${row.runId}#${row.stepIndex} flags=${row.flags.join(",")} latency=${row.latencyMs ?? "?"}ms action=${row.action}`);
      }
    }

    const bug = summary.bugRiskSummary;
    console.log("缺陷风险摘要：");
    if (bug == null) {
      console.log("- 未能计算缺陷风险统计。请检查 bugLedger 是否正常输出。");
    } else {
      console.log(`- 可动作缺陷=${bug.totalActionableBugs}（critical=${bug.criticalActionableBugs} / major=${bug.majorActionableBugs} / minor=${bug.minorActionableBugs}）`);
      console.log(`- 风险类型=${bug.totalRows}（reproduced=${bug.reproducedRowsCurrent} / guardObserved=${bug.guardObservedRowsCurrent}）`);
      if (bug.actionableRatePer100Turns !== null) {
        console.log(`- 每100回合可动作缺陷率=${round2(bug.actionableRatePer100Turns)}`);
      }
      if (bug.topActionableFingerprints.length > 0) {
        console.log(`- Top 风险告警=${bug.topActionableFingerprints.join("；")}`);
      }
    }

    console.log("功能信号：");
    for (const [feature, signal] of Object.entries(summary.featureSignals)) {
      console.log(`- ${feature}: ${signal.decision}`);
    }

    confidenceSourceCheck = validateConfidenceSource(summary, cfg);
    if (!confidenceSourceCheck.pass) {
      console.error(`置信来源门禁未通过：要求 confidenceSource=${cfg.requiredConfidenceSource ?? ""}，当前 ${summary.confidenceSource ?? "缺失"}`);
      await writeGateResult(gateResultPath, buildGateVerdict(cfg, summary, qualityCheck, confidenceSourceCheck, confidenceQualityCheck, bugRiskCheck));
      process.exitCode = 1;
      return;
    }

    confidenceQualityCheck = validateConfidenceQuality(summary, cfg);
    if (!confidenceQualityCheck.pass) {
      console.error(`置信质量门禁未通过：${confidenceQualityCheck.blockers.join("，")}`);
      await writeGateResult(gateResultPath, buildGateVerdict(cfg, summary, qualityCheck, confidenceSourceCheck, confidenceQualityCheck, bugRiskCheck));
      process.exitCode = 1;
      return;
    }

    if (!bugRiskCheck.pass) {
      console.error(`缺陷风险门禁未通过：${bugRiskCheck.blockers.join("，")}`);
      await writeGateResult(gateResultPath, buildGateVerdict(cfg, summary, qualityCheck, confidenceSourceCheck, confidenceQualityCheck, bugRiskCheck));
      process.exitCode = 1;
      return;
    }
  }

  for (const message of qualityCheck.messages) {
    console.log(`成本校验：${message}`);
  }
  if (!qualityCheck.pass) {
    console.error(`成本门禁未通过：${qualityCheck.blockers.join("，")}`);
    await writeGateResult(gateResultPath, buildGateVerdict(cfg, summary, qualityCheck, confidenceSourceCheck, confidenceQualityCheck, bugRiskCheck));
    process.exitCode = 1;
    return;
  }

  if (cfg.includePlan) {
    const planPath = resolve(cfg.out, "next-feature-tests.json");
    console.log(`\n==> 生成下一周期测试建议 -> ${planPath}`);
    const planRet = await spawnScript("scripts/plan-feature-tests.ts", [
      "--report", qualityJson,
      "--out", planPath,
      "--max-calls", String(Math.max(6, cfg.sessions + cfg.steps)),
    ]);
    if (planRet.code !== 0) {
      console.error(`测试建议生成失败，code=${planRet.code}`);
      process.exitCode = planRet.code;
      await writeGateResult(gateResultPath, buildGateVerdict(cfg, summary, qualityCheck, confidenceSourceCheck, confidenceQualityCheck, bugRiskCheck));
      return;
    }
  }

  const verdict = buildGateVerdict(cfg, summary, qualityCheck, confidenceSourceCheck, confidenceQualityCheck, bugRiskCheck);
  if (summary == null) {
    verdict.status = "fail";
    verdict.blockers = Array.from(new Set([...verdict.blockers, "missing_product_quality_summary"]));
  }
  await writeGateResult(gateResultPath, verdict);
  console.log(`\n==> 质量闸道完成：${cfg.out}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export {
  parseCostGate,
  parseBugGate,
  parseConfidenceSourceRequirement,
  resolveConfidenceSourceRequirement,
  validateBugRisk,
  validateConfidenceQuality,
  validateCostConstraints,
  validateConfidenceSource,
};
