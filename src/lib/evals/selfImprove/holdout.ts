/**
 * Self-Improving Agent System — Holdout Corpus & Hash Binding
 *
 * The holdout corpus lives in `benchmarks/self-improve/holdout-cases.json`
 * as the single source of truth (separate from the development pool).
 * Manifests bind holdout evidence to code/prompt/model/corpus/rubric/config
 * hashes; any change invalidates prior holdout evidence.
 *
 * Hash helpers are pure (crypto only); corpus loading is the only IO.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SelfImproveScenario } from "./types";

export const HOLDOUT_CORPUS_PATH = "benchmarks/self-improve/holdout-cases.json";
export const HOLDOUT_RUBRIC_VERSION = "1.0.0";

export interface HoldoutCorpus {
  corpusVersion: string;
  cases: SelfImproveScenario[];
}

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf-8").digest("hex");
}

export function loadHoldoutCorpus(path: string = HOLDOUT_CORPUS_PATH): HoldoutCorpus {
  const abs = resolve(process.cwd(), path);
  if (!existsSync(abs)) return { corpusVersion: "0.0.0-missing", cases: [] };
  try {
    const parsed = JSON.parse(readFileSync(abs, "utf-8")) as HoldoutCorpus;
    return {
      corpusVersion: typeof parsed.corpusVersion === "string" ? parsed.corpusVersion : "0.0.0-unknown",
      cases: Array.isArray(parsed.cases) ? parsed.cases : [],
    };
  } catch {
    return { corpusVersion: "0.0.0-corrupted", cases: [] };
  }
}

export function loadHoldoutCases(path: string = HOLDOUT_CORPUS_PATH): SelfImproveScenario[] {
  return loadHoldoutCorpus(path).cases;
}

/** Deterministic corpus hash: cases sorted by caseId, stable stringify. */
export function computeCorpusHash(cases: SelfImproveScenario[]): string {
  const sorted = [...cases].sort((a, b) => a.caseId.localeCompare(b.caseId));
  return sha256(JSON.stringify(sorted));
}

/** Prompt hash binds evidence to the stable prompt version string. */
export function computePromptHash(promptVersion: string): string {
  return sha256(`prompt:${promptVersion}`);
}

/** Config hash binds evidence to the strict gate configuration surface. */
export function computeConfigHash(configSurface: Record<string, unknown> = {
  minCleanRounds: 3,
  minExpectationMatchRate: 1.0,
  minLiveTraces: 10,
  maxFailingCases: 0,
  requireHoldout: true,
  minValidEvidenceCoverage: 1.0,
  minHoldoutValidCoverage: 1.0,
  minHoldoutValidCases: 8,
  requireAllRequiredHoldoutCases: true,
}): string {
  return sha256(`config:${JSON.stringify(configSurface)}`);
}

/** Full binding comparison between a stored manifest and current reality. */
export interface HashBinding {
  codeHash: string;
  promptHash: string;
  modelId: string;
  corpusHash: string;
  rubricVersion: string;
  configHash: string;
}

export function bindingMismatchFields(stored: HashBinding, current: HashBinding): string[] {
  const fields: (keyof HashBinding)[] = ["codeHash", "promptHash", "modelId", "corpusHash", "rubricVersion", "configHash"];
  return fields.filter((f) => stored[f] !== current[f]);
}
