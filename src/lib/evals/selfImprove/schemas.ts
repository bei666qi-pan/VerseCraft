/**
 * Evaluation & Regression Campaign — JSON Schemas
 *
 * Zod-inspired runtime validation schemas for all artifacts.
 * These validate the shapes of JSON/JSONL outputs at runtime.
 *
 * Since the project uses Zod in some places and plain TS in others,
 * this module provides lightweight runtime validation without adding
 * a new dependency. It uses simple assertion functions.
 */

import type {
  SelfImproveTrace,
  SelfImproveJudgeVerdict,
  SelfImproveViolation,
  DefectSignature,
  TriagedDefect,
  IterationLogEntry,
} from "./types";

// ── Validation helpers ────────────────────────────────

class SchemaValidationError extends Error {
  constructor(
    public field: string,
    message: string,
  ) {
    super(`${field}: ${message}`);
    this.name = "SchemaValidationError";
  }
}

function required(obj: unknown, field: string): asserts obj is Record<string, unknown> {
  if (obj === null || obj === undefined || typeof obj !== "object") {
    throw new SchemaValidationError(field, `expected object, got ${typeof obj}`);
  }
}

function requireString(obj: Record<string, unknown>, field: string): string {
  const val = obj[field];
  if (typeof val !== "string") {
    throw new SchemaValidationError(field, `expected string, got ${typeof val}`);
  }
  return val;
}

function requireNumber(obj: Record<string, unknown>, field: string): number {
  const val = obj[field];
  if (typeof val !== "number" || Number.isNaN(val)) {
    throw new SchemaValidationError(field, `expected number, got ${typeof val}`);
  }
  return val;
}

function requireBoolean(obj: Record<string, unknown>, field: string): boolean {
  const val = obj[field];
  if (typeof val !== "boolean") {
    throw new SchemaValidationError(field, `expected boolean, got ${typeof val}`);
  }
  return val;
}

function requireArray(obj: Record<string, unknown>, field: string): unknown[] {
  const val = obj[field];
  if (!Array.isArray(val)) {
    throw new SchemaValidationError(field, `expected array, got ${typeof val}`);
  }
  return val;
}

function requireStringEnum<T extends string>(
  obj: Record<string, unknown>,
  field: string,
  allowed: readonly T[],
): T {
  const val = requireString(obj, field);
  if (!allowed.includes(val as T)) {
    throw new SchemaValidationError(field, `expected one of [${allowed.join(", ")}], got "${val}"`);
  }
  return val as T;
}

// ── Judge Verdict Schema ──────────────────────────────

const VALID_SEVERITIES = ["critical", "major", "minor"] as const;
const VALID_JUDGE_ROLES = ["gameplay_legality", "npc_fact_grounding", "playability_agency"] as const;

export function validateJudgeVerdict(raw: unknown): SelfImproveJudgeVerdict {
  required(raw, "verdict");
  const v = raw as Record<string, unknown>;

  const caseId = requireString(v, "caseId");
  const judgeRole = requireStringEnum(v, "judgeRole", VALID_JUDGE_ROLES);
  const judgeModel = requireString(v, "judgeModel");
  const passed = requireBoolean(v, "passed");
  const confidence = requireNumber(v, "confidence");
  const inconclusive = typeof v.inconclusive === "boolean" ? v.inconclusive : false;

  required(v, "scores");
  const scoresRaw = v.scores as Record<string, unknown>;
  const scores = {
    gameplayLegality: requireNumber(scoresRaw, "gameplayLegality"),
    factSupport: requireNumber(scoresRaw, "factSupport"),
    epistemicBoundary: requireNumber(scoresRaw, "epistemicBoundary"),
    stateNarrativeConsistency: requireNumber(scoresRaw, "stateNarrativeConsistency"),
    optionExecutability: requireNumber(scoresRaw, "optionExecutability"),
    playerAgency: requireNumber(scoresRaw, "playerAgency"),
    playability: requireNumber(scoresRaw, "playability"),
  };

  const violationsRaw = requireArray(v, "violations");
  const violations: SelfImproveViolation[] = violationsRaw.map((rawV, i) => {
    required(rawV, `violations[${i}]`);
    const rv = rawV as Record<string, unknown>;
    return {
      category: requireString(rv, "category"),
      ruleId: requireString(rv, "ruleId"),
      severity: requireStringEnum(rv, "severity", VALID_SEVERITIES),
      stepIndex: requireNumber(rv, "stepIndex"),
      evidence: requireString(rv, "evidence"),
      expected: requireString(rv, "expected"),
      actual: requireString(rv, "actual"),
      factId: typeof rv.factId === "string" ? rv.factId : undefined,
      recommendedTests: Array.isArray(rv.recommendedTests)
        ? rv.recommendedTests.map(String)
        : [],
    };
  });

  return {
    caseId,
    judgeRole,
    judgeModel,
    passed,
    confidence,
    scores,
    violations,
    inconclusive,
    inconclusiveReason: typeof v.inconclusiveReason === "string" ? v.inconclusiveReason : undefined,
  };
}

// ── Defect Signature Schema ───────────────────────────

export function validateDefectSignature(raw: unknown): DefectSignature {
  required(raw, "defectSignature");
  const d = raw as Record<string, unknown>;
  return {
    fingerprint: requireString(d, "fingerprint"),
    category: requireString(d, "category"),
    ruleId: requireString(d, "ruleId"),
    affectedSystem: requireString(d, "affectedSystem"),
    normalizedExpected: requireString(d, "normalizedExpected"),
    normalizedActual: requireString(d, "normalizedActual"),
  };
}

// ── Trace Schema ──────────────────────────────────────

export function validateTrace(raw: unknown): SelfImproveTrace {
  required(raw, "trace");
  const t = raw as Record<string, unknown>;

  // Pre-state and post-state are complex nested objects; we validate
  // only the top-level required string/number fields strictly.
  return {
    traceId: requireString(t, "traceId"),
    runId: requireString(t, "runId"),
    round: requireNumber(t, "round"),
    caseId: requireString(t, "caseId"),
    seed: requireNumber(t, "seed"),
    model: requireString(t, "model"),
    provider: requireString(t, "provider"),
    startedAt: requireString(t, "startedAt"),
    endedAt: requireString(t, "endedAt"),
    durationMs: requireNumber(t, "durationMs"),
    preState: (t.preState as Record<string, unknown>) ?? {},
    playerInput: requireString(t, "playerInput"),
    injectedFacts: Array.isArray(t.injectedFacts) ? t.injectedFacts.map(String) : [],
    rawModelOutput: requireString(t, "rawModelOutput"),
    parsedDmJson: (t.parsedDmJson as Record<string, unknown> | null) ?? null,
    normalizedDmJson: (t.normalizedDmJson as Record<string, unknown> | null) ?? null,
    validatorOutput: (t.validatorOutput as Record<string, unknown> | null) ?? null,
    proposedStateDelta: (t.proposedStateDelta as Record<string, unknown> | null) ?? null,
    finalStateDelta: (t.finalStateDelta as Record<string, unknown> | null) ?? null,
    finalState: (t.finalState as Record<string, unknown> | null) ?? null,
    narrative: requireString(t, "narrative"),
    options: Array.isArray(t.options) ? t.options.map(String) : [],
    errors: Array.isArray(t.errors) ? t.errors.map(String) : [],
    errorClass: typeof t.errorClass === "string" ? t.errorClass : undefined,
    recoveryInfo: typeof t.recoveryInfo === "string" ? t.recoveryInfo : null,
    tokenUsage: (t.tokenUsage as SelfImproveTrace["tokenUsage"]) ?? null,
    latencyMs: requireNumber(t, "latencyMs"),
  };
}

// ── Iteration Log Schema ──────────────────────────────

export function validateIterationLogEntry(raw: unknown): IterationLogEntry {
  required(raw, "entry");
  const e = raw as Record<string, unknown>;
  return {
    round: requireNumber(e, "round"),
    phase: requireString(e, "phase") as IterationLogEntry["phase"],
    timestamp: requireString(e, "timestamp"),
    scenarioCount: requireNumber(e, "scenarioCount"),
    traceCount: requireNumber(e, "traceCount"),
    defectsFound: requireNumber(e, "defectsFound"),
    defectsRepaired: requireNumber(e, "defectsRepaired"),
    repairsSucceeded: requireNumber(e, "repairsSucceeded"),
    repairsFailed: requireNumber(e, "repairsFailed"),
    qualityGateResult: (e.qualityGateResult as IterationLogEntry["qualityGateResult"]) ?? null,
    stopReason: (e.stopReason as IterationLogEntry["stopReason"]) ?? null,
    notes: requireString(e, "notes"),
  };
}

// ── Manifest Schema ───────────────────────────────────

export interface RunManifest {
  runId: string;
  profile: string;
  seed: number;
  startedAt: string;
  status: string;
  rounds: number;
  provenance: Record<string, string>;
  holdout?: {
    caseIds: string[];
    corpusHash: string;
    executedAt: string | null;
  };
  hashes?: {
    codeHash: string;
    promptHash: string;
    modelId: string;
    corpusHash: string;
    rubricVersion: string;
    configHash: string;
  };
}

export function validateRunManifest(raw: unknown): RunManifest {
  required(raw, "manifest");
  const m = raw as Record<string, unknown>;
  return {
    runId: requireString(m, "runId"),
    profile: requireString(m, "profile"),
    seed: requireNumber(m, "seed"),
    startedAt: requireString(m, "startedAt"),
    status: requireString(m, "status"),
    rounds: requireNumber(m, "rounds"),
    provenance: (m.provenance as Record<string, string>) ?? {},
  };
}
