import type {
  BuildEndingIdempotencyKeyInput,
  EndingEligibility,
  EndingEvaluationInput,
  EndingOutcome,
} from "./types";

export const ENDING_OUTCOME_PRIORITY: Record<EndingOutcome, number> = {
  death: 100,
  true_escape: 90,
  costly_escape: 80,
  false_escape: 70,
  doom: 60,
  abandon: 50,
};

function toInt(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeTurn(value: unknown): number {
  return Math.max(0, toInt(value, 0));
}

function createEligibility(input: {
  outcome: EndingOutcome;
  confidence?: number;
  reasons: string[];
  blockers?: string[];
  detectedAtTurn: number;
  source: EndingEligibility["source"];
}): EndingEligibility {
  return {
    outcome: input.outcome,
    confidence: clamp01(input.confidence ?? 1),
    reasons: input.reasons,
    blockers: input.blockers ?? [],
    detectedAtTurn: normalizeTurn(input.detectedAtTurn),
    source: input.source,
    priority: ENDING_OUTCOME_PRIORITY[input.outcome],
  };
}

function getSurvivalHours(input: Pick<EndingEvaluationInput, "time">): number {
  const day = Math.max(0, toInt(input.time?.day, 0));
  const hour = Math.max(0, toInt(input.time?.hour, 0));
  return day * 24 + hour;
}

function getEscapeStage(input: EndingEvaluationInput): string {
  return String(input.escapeMainline?.stage ?? "");
}

export function evaluateEndingEligibility(input: EndingEvaluationInput): EndingEligibility | null {
  const detectedAtTurn = normalizeTurn(input.turnCount);
  const sanity = Number(input.stats?.sanity ?? 0);
  if (input.resolvedTurn?.is_death === true) {
    return createEligibility({
      outcome: "death",
      reasons: ["resolved_turn_is_death"],
      detectedAtTurn,
      source: "resolved_turn",
    });
  }
  if (Number.isFinite(sanity) && sanity <= 0) {
    return createEligibility({
      outcome: "death",
      reasons: ["sanity_depleted"],
      detectedAtTurn,
      source: "player_stats",
    });
  }

  const escapeStage = getEscapeStage(input);
  if (escapeStage === "escaped_true") {
    return createEligibility({
      outcome: "true_escape",
      reasons: ["escape_mainline_escaped_true"],
      detectedAtTurn,
      source: "escape_mainline",
    });
  }
  if (escapeStage === "escaped_costly") {
    return createEligibility({
      outcome: "costly_escape",
      reasons: ["escape_mainline_escaped_costly"],
      detectedAtTurn,
      source: "escape_mainline",
    });
  }
  if (escapeStage === "escaped_false") {
    return createEligibility({
      outcome: "false_escape",
      reasons: ["escape_mainline_escaped_false"],
      detectedAtTurn,
      source: "escape_mainline",
    });
  }

  const survivalHours = getSurvivalHours(input);
  const day = Math.max(0, toInt(input.time?.day, 0));
  if (survivalHours >= 240 || day > 10 || day === 10) {
    return createEligibility({
      outcome: "doom",
      reasons: survivalHours >= 240 ? ["survival_hours_gte_240"] : [`day_threshold:${day}`],
      detectedAtTurn,
      source: "time",
    });
  }

  if (input.abandonRequested === true) {
    return createEligibility({
      outcome: "abandon",
      reasons: ["player_abandoned_run"],
      detectedAtTurn,
      source: "manual",
    });
  }

  return null;
}

export function buildEndingIdempotencyKey(input: BuildEndingIdempotencyKeyInput): string {
  const runId = String(input.runId ?? "").trim() || "unknown_run";
  const turn = normalizeTurn(input.detectedAtTurn);
  return `${runId}:${input.outcome}:${turn}`;
}
