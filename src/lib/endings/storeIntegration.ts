import { evaluateEndingEligibility } from "./rules";
import { createInitialEndingState, transitionEndingState } from "./stateMachine";
import { buildSettlementSnapshot } from "./summary";
import type {
  BuildSettlementSnapshotInput,
  EndingEligibility,
  EndingEvaluationInput,
  EndingDeathContext,
  EndingFinalChoice,
  EndingFinalChoiceId,
  EndingOutcome,
  EndingPhase,
  EndingSettlementSnapshot,
  EndingState,
} from "./types";

type StoreLogEntry = { role: string; content: string; reasoning?: string };

const ENDING_PHASES = new Set<EndingPhase>([
  "playing",
  "eligible",
  "final_turn_pending",
  "final_narrative_committing",
  "settlement_ready",
  "settled",
]);

const ENDING_OUTCOMES = new Set<EndingOutcome>([
  "death",
  "doom",
  "true_escape",
  "costly_escape",
  "false_escape",
  "abandon",
]);

const ENDING_FINAL_CHOICE_IDS = new Set<EndingFinalChoiceId>([
  "true_door",
  "leave_with_npc",
  "leave_alone",
  "mirror_exit",
  "embrace_doom",
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asStringArray(value: unknown, cap: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const text = String(item ?? "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= cap) break;
  }
  return out;
}

function normalizeEligibility(raw: unknown): EndingEligibility | null {
  const record = asRecord(raw);
  const outcome = asString(record.outcome) as EndingOutcome;
  if (!ENDING_OUTCOMES.has(outcome)) return null;
  const source = asString(record.source);
  const safeSource =
    source === "resolved_turn" ||
    source === "player_stats" ||
    source === "escape_mainline" ||
    source === "time" ||
    source === "manual"
      ? source
      : "manual";
  return {
    outcome,
    confidence: Math.max(0, Math.min(1, asFiniteNumber(record.confidence, 1))),
    reasons: asStringArray(record.reasons, 24),
    blockers: asStringArray(record.blockers, 24),
    detectedAtTurn: Math.max(0, Math.trunc(asFiniteNumber(record.detectedAtTurn, 0))),
    source: safeSource,
    priority: Math.max(0, Math.trunc(asFiniteNumber(record.priority, 0))),
  };
}

function normalizeFinalChoice(raw: unknown): EndingFinalChoice | null {
  const record = asRecord(raw);
  const id = asString(record.id) as EndingFinalChoiceId;
  const outcome = asString(record.outcome) as EndingOutcome;
  if (!ENDING_FINAL_CHOICE_IDS.has(id) || !ENDING_OUTCOMES.has(outcome)) return null;
  return {
    id,
    label: asString(record.label).slice(0, 80),
    description: asString(record.description).slice(0, 200),
    outcome,
    selectedAt: asString(record.selectedAt),
  };
}

function normalizeDeathContext(raw: unknown): EndingDeathContext | null {
  const record = asRecord(raw);
  const deathCause = asString(record.deathCause).slice(0, 160) || null;
  const deathLocation = asString(record.deathLocation).slice(0, 120) || null;
  const lastAction = asString(record.lastAction).slice(0, 240) || null;
  if (!deathCause && !deathLocation && !lastAction) return null;
  return { deathCause, deathLocation, lastAction };
}

export function normalizeEndingSettlementSnapshot(raw: unknown): EndingSettlementSnapshot | null {
  const record = asRecord(raw);
  const outcome = asString(record.outcome) as EndingOutcome;
  if (record.v !== 1 || !ENDING_OUTCOMES.has(outcome)) return null;
  const grade = asString(record.grade);
  const safeGrade = grade === "S" || grade === "A" || grade === "B" || grade === "C" || grade === "D" || grade === "E" ? grade : "E";
  return {
    v: 1,
    runId: asString(record.runId, "unknown_run"),
    settlementId: asString(record.settlementId, "unknown_settlement"),
    outcome,
    grade: safeGrade,
    title: asString(record.title),
    caption: asString(record.caption),
    finalNarrative: asString(record.finalNarrative),
    survivalHours: Math.max(0, Math.trunc(asFiniteNumber(record.survivalHours, 0))),
    survivalDay: Math.max(0, Math.trunc(asFiniteNumber(record.survivalDay, 0))),
    survivalHour: Math.max(0, Math.trunc(asFiniteNumber(record.survivalHour, 0))),
    maxFloorScore: Math.max(0, Math.trunc(asFiniteNumber(record.maxFloorScore, 0))),
    maxFloorLabel: asString(record.maxFloorLabel),
    killedAnomalies: Math.max(0, Math.trunc(asFiniteNumber(record.killedAnomalies, 0))),
    keyChoices: asStringArray(record.keyChoices, 12),
    obtainedClues: asStringArray(record.obtainedClues, 16),
    npcEpilogues: asStringArray(record.npcEpilogues, 16),
    worldStateLines: asStringArray(record.worldStateLines, 16),
    finalChoiceLabel: asString(record.finalChoiceLabel) || null,
    deathCause: asString(record.deathCause) || null,
    deathLocation: asString(record.deathLocation) || null,
    lastAction: asString(record.lastAction) || null,
    createdAt: asString(record.createdAt, "1970-01-01T00:00:00.000Z"),
    writingMarkdown: asString(record.writingMarkdown),
  };
}

export function normalizeEndingState(raw: unknown): EndingState {
  const base = createInitialEndingState();
  const record = asRecord(raw);
  const phase = ENDING_PHASES.has(asString(record.phase) as EndingPhase)
    ? (record.phase as EndingPhase)
    : base.phase;
  const eligibility = normalizeEligibility(record.eligibility);
  const settlementSnapshot = normalizeEndingSettlementSnapshot(record.settlementSnapshot);
  const safePhase = phase === "settlement_ready" && !settlementSnapshot ? (eligibility ? "eligible" : "playing") : phase;
  return {
    phase: safePhase,
    eligibility,
    finalChoice: normalizeFinalChoice(record.finalChoice),
    deathContext: normalizeDeathContext(record.deathContext),
    finalNarrative: typeof record.finalNarrative === "string" ? record.finalNarrative : null,
    settlementSnapshot,
    redirectedAt: typeof record.redirectedAt === "string" ? record.redirectedAt : null,
    settledAt: typeof record.settledAt === "string" ? record.settledAt : null,
    idempotencyKey: typeof record.idempotencyKey === "string" ? record.idempotencyKey : null,
  };
}

export function resolveEndingRunId(input: {
  runId?: unknown;
  slotRunId?: unknown;
  currentSaveSlot?: unknown;
}): string {
  const direct = asString(input.runId).trim();
  if (direct) return direct;
  const slotRunId = asString(input.slotRunId).trim();
  if (slotRunId) return slotRunId;
  const slot = asString(input.currentSaveSlot, "main_slot").trim() || "main_slot";
  return `local:${slot}`;
}

export function buildEndingEvaluationInputFromStore(input: {
  stats: EndingEvaluationInput["stats"];
  time: EndingEvaluationInput["time"];
  playerLocation: string;
  historicalMaxFloorScore: number;
  escapeMainline?: { stage?: unknown } | null;
  logs: StoreLogEntry[];
  turnCount?: number;
  resolvedTurn?: EndingEvaluationInput["resolvedTurn"];
  lastAction?: string | null;
  abandonRequested?: boolean;
}): EndingEvaluationInput {
  return {
    stats: input.stats ?? {},
    time: input.time ?? { day: 0, hour: 0 },
    playerLocation: input.playerLocation ?? "B1_SafeZone",
    historicalMaxFloorScore: Math.max(0, Math.trunc(asFiniteNumber(input.historicalMaxFloorScore, 0))),
    escapeMainline: input.escapeMainline ?? null,
    logs: Array.isArray(input.logs) ? input.logs : [],
    turnCount: Math.max(0, Math.trunc(asFiniteNumber(input.turnCount, Array.isArray(input.logs) ? input.logs.length : 0))),
    resolvedTurn: input.resolvedTurn ?? null,
    lastAction: input.lastAction ?? null,
    abandonRequested: input.abandonRequested,
  };
}

export function buildEndingDeathContextFromEvaluation(input: EndingEvaluationInput): EndingDeathContext | null {
  const resolved = asRecord(input.resolvedTurn);
  const cause =
    asString(resolved.death_cause) ||
    asString(resolved.deathCause) ||
    (Number(input.stats?.sanity ?? 0) <= 0 ? "sanity_depleted" : "");
  const location = asString(resolved.player_location) || input.playerLocation || "";
  const lastUser = [...(input.logs ?? [])].reverse().find((entry) => entry.role === "user")?.content ?? "";
  const lastAction = asString(input.lastAction) || lastUser;
  if (!cause && !location && !lastAction) return null;
  return {
    deathCause: cause || null,
    deathLocation: location || null,
    lastAction: lastAction || null,
  };
}

function collectKeyChoices(logs: readonly StoreLogEntry[]): string[] {
  return asStringArray(
    logs
      .filter((entry) => entry?.role === "user")
      .slice(-12)
      .map((entry) => entry.content),
    12
  );
}

function collectObtainedClues(input: { journalClues?: unknown[]; codex?: Record<string, unknown> }): string[] {
  const fromJournal = (Array.isArray(input.journalClues) ? input.journalClues : []).map((raw) => {
    const record = asRecord(raw);
    return asString(record.title) || asString(record.name) || asString(record.id);
  });
  const fromCodex = Object.entries(input.codex ?? {}).map(([id, raw]) => {
    const record = asRecord(raw);
    return asString(record.name) || id;
  });
  return asStringArray([...fromJournal, ...fromCodex], 16);
}

function collectNpcEpilogues(codex?: Record<string, unknown>): string[] {
  const lines: string[] = [];
  for (const [id, raw] of Object.entries(codex ?? {})) {
    const record = asRecord(raw);
    if (record.type !== "npc") continue;
    const name = asString(record.name) || id;
    const trust = record.trust !== undefined ? `trust=${Math.trunc(asFiniteNumber(record.trust, 0))}` : "";
    const favor = record.favorability !== undefined ? `favor=${Math.trunc(asFiniteNumber(record.favorability, 0))}` : "";
    lines.push([name, trust, favor].filter(Boolean).join(" "));
  }
  return asStringArray(lines, 16);
}

function collectWorldStateLines(input: {
  stats: Record<string, unknown>;
  time: { day?: number | null; hour?: number | null };
  playerLocation: string;
  escapeMainline?: { stage?: unknown } | null;
}): string[] {
  return asStringArray(
    [
      `location:${input.playerLocation || "B1_SafeZone"}`,
      `time:day=${Math.trunc(asFiniteNumber(input.time?.day, 0))},hour=${Math.trunc(asFiniteNumber(input.time?.hour, 0))}`,
      `sanity:${Math.trunc(asFiniteNumber(input.stats?.sanity, 0))}`,
      input.escapeMainline?.stage ? `escape:${String(input.escapeMainline.stage)}` : "",
    ],
    16
  );
}

export function buildEndingSettlementSnapshotFromStore(input: {
  runId: string;
  endingState: EndingState;
  stats: BuildSettlementSnapshotInput["stats"];
  time: BuildSettlementSnapshotInput["time"];
  playerLocation: string;
  historicalMaxFloorScore: number;
  logs: StoreLogEntry[];
  codex?: Record<string, unknown>;
  journalClues?: unknown[];
  escapeMainline?: { stage?: unknown } | null;
  finalNarrative?: string | null;
  createdAt?: string;
}): EndingSettlementSnapshot | null {
  const endingState = normalizeEndingState(input.endingState);
  if (!endingState.eligibility) return null;
  return buildSettlementSnapshot({
    runId: input.runId,
    eligibility: endingState.eligibility,
    stats: input.stats ?? {},
    time: input.time ?? { day: 0, hour: 0 },
    playerLocation: input.playerLocation ?? "B1_SafeZone",
    historicalMaxFloorScore: Math.max(0, Math.trunc(asFiniteNumber(input.historicalMaxFloorScore, 0))),
    logs: Array.isArray(input.logs) ? input.logs : [],
    finalNarrative: input.finalNarrative ?? endingState.finalNarrative,
    createdAt: input.createdAt ?? new Date().toISOString(),
    settlementId: endingState.idempotencyKey ? `settlement:${endingState.idempotencyKey}` : undefined,
    keyChoices: collectKeyChoices(input.logs ?? []),
    obtainedClues: collectObtainedClues({ journalClues: input.journalClues, codex: input.codex }),
    npcEpilogues: collectNpcEpilogues(input.codex),
    worldStateLines: collectWorldStateLines({
      stats: input.stats ?? {},
      time: input.time ?? { day: 0, hour: 0 },
      playerLocation: input.playerLocation ?? "B1_SafeZone",
      escapeMainline: input.escapeMainline ?? null,
    }),
    finalChoice: endingState.finalChoice,
    deathContext: endingState.deathContext,
  });
}

export function evaluateEndingAfterTurnForStore(input: {
  prev: EndingState;
  runId: string;
  evaluation: EndingEvaluationInput;
  snapshotInput: Omit<Parameters<typeof buildEndingSettlementSnapshotFromStore>[0], "endingState" | "runId">;
}): EndingState {
  const prev = normalizeEndingState(input.prev);
  const eligibility = evaluateEndingEligibility(input.evaluation);
  const afterEligibility = transitionEndingState(prev, {
    type: "TURN_COMMITTED",
    runId: input.runId,
    eligibility,
    deathContext: eligibility?.outcome === "death" ? buildEndingDeathContextFromEvaluation(input.evaluation) : null,
  });
  if (!eligibility || afterEligibility.phase !== "eligible") return afterEligibility;
  if (eligibility.outcome !== "death") return afterEligibility;
  const snapshot = buildEndingSettlementSnapshotFromStore({
    ...input.snapshotInput,
    runId: input.runId,
    endingState: afterEligibility,
  });
  return transitionEndingState(afterEligibility, {
    type: "SETTLEMENT_SNAPSHOT_CREATED",
    snapshot,
    idempotencyKey: afterEligibility.idempotencyKey,
  });
}
