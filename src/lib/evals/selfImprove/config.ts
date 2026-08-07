/**
 * Self-Improving Agent System — Configuration
 *
 * Single entry point for all system configuration.
 * Reads from environment variables with sensible defaults.
 */

import type {
  SelfImproveBudget,
  SelfImproveProfile,
  StopPolicy,
} from "./types";
import { SMOKE_BUDGET, STANDARD_BUDGET } from "./types";

// ── Environment ───────────────────────────────────────

export function resolveSelfImproveBudget(profile: SelfImproveProfile): SelfImproveBudget {
  const base = profile === "smoke" ? { ...SMOKE_BUDGET } : { ...STANDARD_BUDGET };

  // Allow env overrides
  if (process.env.SI_MAX_ROUNDS) base.maxRounds = parseInt(process.env.SI_MAX_ROUNDS, 10);
  if (process.env.SI_MAX_LIVE_CALLS) base.maxLiveModelCalls = parseInt(process.env.SI_MAX_LIVE_CALLS, 10);
  if (process.env.SI_MAX_DURATION_MIN) base.maxDurationMinutes = parseInt(process.env.SI_MAX_DURATION_MIN, 10);
  if (process.env.SI_GAME_CONCURRENCY) base.gameConcurrency = parseInt(process.env.SI_GAME_CONCURRENCY, 10);
  if (process.env.SI_JUDGE_CONCURRENCY) base.judgeConcurrency = parseInt(process.env.SI_JUDGE_CONCURRENCY, 10);
  if (process.env.SI_JUDGES_PER_CASE) base.judgesPerCase = parseInt(process.env.SI_JUDGES_PER_CASE, 10);
  if (process.env.SI_MIN_JUDGE_CONFIDENCE) base.minimumJudgeConfidence = parseFloat(process.env.SI_MIN_JUDGE_CONFIDENCE);
  if (process.env.SI_REQUIRED_JUDGE_AGREEMENT) base.requiredJudgeAgreement = parseInt(process.env.SI_REQUIRED_JUDGE_AGREEMENT, 10);

  return base;
}

export function resolveStopPolicy(budget: SelfImproveBudget): StopPolicy {
  return {
    maxRounds: budget.maxRounds,
    noImprovementRounds: 2,
    maxConsecutiveRepairFailures: 2,
    minLiveCoverage: 0.8,
  };
}

// ── Runtime directories ───────────────────────────────

export function getSelfImproveRuntimeDir(runId: string): string {
  return `.runtime-data/self-improve/${runId}`;
}

export function getSelfImproveCurrentDir(): string {
  return `.runtime-data/self-improve/current`;
}

// ── Run ID generation ─────────────────────────────────

export function generateRunId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = now.toISOString().slice(11, 19).replace(/:/g, "");
  return `si-${date}-${time}`;
}

// ── Mode detection ────────────────────────────────────

export function isLiveMode(): boolean {
  return process.env.SI_LIVE_MODE === "1" || process.argv.includes("--live");
}

export function isMockMode(): boolean {
  return !isLiveMode();
}

export function isDryRun(): boolean {
  return process.argv.includes("--dry-run");
}

// ── Run filters ───────────────────────────────────────

export interface RunFilterOptions {
  scenarioIds?: string[];
  maxRounds?: number;
  profile?: SelfImproveProfile;
}
