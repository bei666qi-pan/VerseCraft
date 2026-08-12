/**
 * Evaluation & Regression Campaign — State Machine
 *
 * Manages the lifecycle of a self-improvement run:
 * phase transitions, state persistence, resume capability,
 * and progress tracking.
 */

import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type {
  SelfImprovePhase,
  SelfImproveState,
  SelfImproveStatus,
  StopReason,
} from "./types";
import { getSelfImproveRuntimeDir } from "./config";
import type { RunManifest } from "./schemas";
import { resolveExperimentProvenance } from "@/lib/evals/harness/provenance";
import { atomicWriteJsonSync, loadJsonWithFallback } from "./atomicWrite";
import {
  loadHoldoutCases, computeCorpusHash, computePromptHash, computeConfigHash, HOLDOUT_RUBRIC_VERSION,
} from "./holdout";

// ── Phase transitions ─────────────────────────────────

const VALID_TRANSITIONS: Record<SelfImprovePhase, SelfImprovePhase[]> = {
  discovery: ["baseline"],
  baseline: ["scenario_building"],
  scenario_building: ["game_execution"],
  // "reporting" is allowed for the post-campaign holdout path, which runs
  // game turns but intentionally skips the judge ensemble.
  game_execution: ["judging", "reporting"],
  judging: ["triage"],
  triage: ["repair", "reporting", "stopped", "game_execution"],
  repair: ["quality_gate"],
  quality_gate: ["live_eval", "repair", "reporting", "stopped", "game_execution", "scenario_building"],
  live_eval: ["repair", "reporting", "stopped", "game_execution"],
  reporting: ["stopped"],
  stopped: [],
};

export function canTransition(from: SelfImprovePhase, to: SelfImprovePhase): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return allowed !== undefined && allowed.includes(to);
}

export function nextPhase(current: SelfImprovePhase): SelfImprovePhase | null {
  const allowed = VALID_TRANSITIONS[current];
  if (!allowed || allowed.length === 0) return null;
  return allowed[0]!;
}

// ── State management ──────────────────────────────────

const DEFAULT_STATE: Omit<SelfImproveState, "runId" | "provenance"> = {
  phase: "discovery",
  status: "running",
  currentRound: 0,
  budget: {
    maxRounds: 3,
    maxLiveModelCalls: 80,
    maxDurationMinutes: 60,
    gameConcurrency: 4,
    judgeConcurrency: 3,
    judgesPerCase: 3,
    minimumJudgeConfidence: 0.8,
    requiredJudgeAgreement: 2,
    repeatedLiveRuns: 3,
  },
  stopPolicy: {
    maxRounds: 3,
    noImprovementRounds: 2,
    maxConsecutiveRepairFailures: 2,
    minLiveCoverage: 0.8,
  },
  liveModelCallsUsed: 0,
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  resumed: false,
};

// ── In-memory state ───────────────────────────────────

let currentState: SelfImproveState | null = null;

export function getState(): SelfImproveState | null {
  return currentState;
}

export function initState(runId: string, overrides: Partial<SelfImproveState> = {}): SelfImproveState {
  const provenance = resolveExperimentProvenance();
  currentState = {
    ...DEFAULT_STATE,
    runId: {
      id: runId,
      startedAt: new Date().toISOString(),
      profile: "smoke",
      seed: Date.now(),
    },
    provenance,
    ...overrides,
  } as SelfImproveState;
  return currentState;
}

export function transitionTo(phase: SelfImprovePhase): SelfImproveState {
  if (!currentState) throw new Error("State not initialized. Call initState() first.");
  if (!canTransition(currentState.phase, phase)) {
    throw new Error(
      `Invalid phase transition: ${currentState.phase} -> ${phase}. ` +
      `Allowed: ${(VALID_TRANSITIONS[currentState.phase] ?? []).join(", ")}`,
    );
  }
  currentState.phase = phase;
  currentState.updatedAt = new Date().toISOString();
  return currentState;
}

export function setStatus(status: SelfImproveStatus): void {
  if (!currentState) throw new Error("State not initialized.");
  currentState.status = status;
  currentState.updatedAt = new Date().toISOString();
}

export function incrementRound(): number {
  if (!currentState) throw new Error("State not initialized.");
  currentState.currentRound += 1;
  currentState.updatedAt = new Date().toISOString();
  return currentState.currentRound;
}

export function trackLiveCall(count = 1): number {
  if (!currentState) throw new Error("State not initialized.");
  currentState.liveModelCallsUsed += count;
  return currentState.liveModelCallsUsed;
}

// ── Persistence ───────────────────────────────────────

function statePath(runId: string): string {
  const dir = getSelfImproveRuntimeDir(runId);
  return resolve(process.cwd(), dir, "state.json");
}

function manifestPath(runId: string): string {
  const dir = getSelfImproveRuntimeDir(runId);
  return resolve(process.cwd(), dir, "manifest.json");
}

export function saveState(): void {
  if (!currentState) throw new Error("State not initialized.");
  const dir = resolve(process.cwd(), getSelfImproveRuntimeDir(currentState.runId.id));
  mkdirSync(dir, { recursive: true });

  const path = statePath(currentState.runId.id);
  const r = atomicWriteJsonSync(path, currentState);
  if (!r.ok) console.error(`[stateMachine] WARNING: state write failed: ${r.error}`);
}

export function saveManifest(): void {
  if (!currentState) throw new Error("State not initialized.");
  const dir = resolve(process.cwd(), getSelfImproveRuntimeDir(currentState.runId.id));
  mkdirSync(dir, { recursive: true });

  const holdoutCases = loadHoldoutCases();
  const corpusHash = computeCorpusHash(holdoutCases);
  const manifest: RunManifest = {
    runId: currentState.runId.id,
    profile: currentState.runId.profile,
    seed: currentState.runId.seed,
    startedAt: currentState.startedAt,
    status: currentState.status,
    rounds: currentState.currentRound,
    provenance: {
      commit: currentState.provenance.commit,
      promptVersion: currentState.provenance.promptVersion,
      model: currentState.provenance.model,
    },
    holdout: {
      caseIds: holdoutCases.map((c) => c.caseId),
      corpusHash,
      executedAt: currentState.holdoutExecutedAt ?? null,
    },
    hashes: {
      codeHash: currentState.provenance.commit,
      promptHash: computePromptHash(currentState.provenance.promptVersion),
      modelId: currentState.provenance.model,
      corpusHash,
      rubricVersion: HOLDOUT_RUBRIC_VERSION,
      configHash: computeConfigHash(),
    },
  };
  const r = atomicWriteJsonSync(manifestPath(currentState.runId.id), manifest);
  if (!r.ok) console.error(`[stateMachine] WARNING: manifest write failed: ${r.error}`);
}

export function loadState(runId: string): SelfImproveState | null {
  const path = statePath(runId);
  if (!existsSync(path)) return null;
  const result = loadJsonWithFallback<SelfImproveState>(path);
  if (result.value) currentState = result.value;
  return result.value;
}

export function resumeFrom(runId: string): SelfImproveState {
  const state = loadState(runId);
  if (!state) throw new Error(`Cannot resume run ${runId}: state not found.`);
  if (state.status === "completed" || state.status === "stopped") {
    throw new Error(`Cannot resume run ${runId}: already ${state.status}.`);
  }
  state.resumed = true;
  state.resumedFromRunId = runId;
  currentState = state;
  return state;
}
