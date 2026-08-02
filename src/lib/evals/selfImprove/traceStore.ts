/**
 * Self-Improving Agent System — Trace Store
 *
 * Persists execution traces to JSONL files for later analysis,
 * replay, and judge evaluation. Each trace is a complete record
 * of a single game turn execution.
 */

import { appendFileSync, existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SelfImproveTrace } from "./types";
import { getSelfImproveRuntimeDir } from "./config";
import { atomicWriteJsonSync } from "./atomicWrite";

// ── Trace storage ─────────────────────────────────────

function tracesPath(runId: string): string {
  const dir = getSelfImproveRuntimeDir(runId);
  return resolve(process.cwd(), dir, "traces.jsonl");
}

function deterministicResultsPath(runId: string): string {
  const dir = getSelfImproveRuntimeDir(runId);
  return resolve(process.cwd(), dir, "deterministic-results.json");
}

// ── Write operations ──────────────────────────────────

export function writeTrace(runId: string, trace: SelfImproveTrace): void {
  const dir = resolve(process.cwd(), getSelfImproveRuntimeDir(runId));
  mkdirSync(dir, { recursive: true });

  const path = tracesPath(runId);
  appendFileSync(path, JSON.stringify(trace) + "\n", "utf-8");
}

export function writeTraces(runId: string, traces: SelfImproveTrace[]): void {
  for (const trace of traces) {
    writeTrace(runId, trace);
  }
}

// ── Read operations ───────────────────────────────────

export function readTraces(runId: string): SelfImproveTrace[] {
  const path = tracesPath(runId);
  if (!existsSync(path)) return [];

  const content = readFileSync(path, "utf-8");
  return content
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as SelfImproveTrace;
      } catch {
        return null;
      }
    })
    .filter((t): t is SelfImproveTrace => t !== null);
}

export function readTracesByCaseId(runId: string, caseId: string): SelfImproveTrace[] {
  return readTraces(runId).filter((t) => t.caseId === caseId);
}

export function readTracesByRound(runId: string, round: number): SelfImproveTrace[] {
  return readTraces(runId).filter((t) => t.round === round);
}

export function traceCount(runId: string): number {
  return readTraces(runId).length;
}

// ── Deterministic results ─────────────────────────────

export interface DeterministicCaseResult {
  caseId: string;
  passed: boolean;
  invariantResults: {
    invariantId: string;
    check: string;
    expected: string;
    actual: string;
    passed: boolean;
    severity: string;
  }[];
  errors: string[];
  /** Error classification; non-gameplay classes are excluded from Oracle stats */
  errorClass?: import("./errorClassification").ErrorClass;
}

export function writeDeterministicResults(
  runId: string,
  results: DeterministicCaseResult[],
): void {
  const dir = resolve(process.cwd(), getSelfImproveRuntimeDir(runId));
  mkdirSync(dir, { recursive: true });

  atomicWriteJsonSync(deterministicResultsPath(runId), results);
}

export function readDeterministicResults(runId: string): DeterministicCaseResult[] {
  const path = deterministicResultsPath(runId);
  if (!existsSync(path)) return [];

  try {
    return JSON.parse(readFileSync(path, "utf-8")) as DeterministicCaseResult[];
  } catch {
    return [];
  }
}

// ── Cleanup ───────────────────────────────────────────

export function clearTraces(runId: string): void {
  const dir = resolve(process.cwd(), getSelfImproveRuntimeDir(runId));
  mkdirSync(dir, { recursive: true });
  writeFileSync(tracesPath(runId), "", "utf-8");
}
