import type { AnalyticsEventName } from "@/lib/analytics/types";
import type { EndingState } from "@/lib/endings/types";

export type EndingTelemetryEventName = Extract<
  AnalyticsEventName,
  | "ending_eligible_detected"
  | "ending_final_choice_shown"
  | "ending_final_choice_selected"
  | "ending_final_narrative_committed"
  | "ending_settlement_snapshot_created"
  | "ending_redirected_to_settlement"
  | "ending_settlement_viewed"
  | "ending_settlement_history_submitted"
  | "ending_blocked"
>;

export type EndingTelemetryPayload = {
  runId: string;
  outcome: string | null;
  endingPhase: string;
  detectedAtTurn: number | null;
  idempotencyKey: string | null;
  reasons: string[];
  blockers: string[];
  escapeStage: string;
  survivalHours: number;
  source: string;
  snapshotPresent: boolean;
  settlementId: string | null;
} & Record<string, unknown>;

type EndingTelemetryTime = {
  day?: number | null;
  hour?: number | null;
};

export type BuildEndingTelemetryPayloadInput = {
  endingState?: EndingState | null;
  runId?: string | null;
  escapeStage?: unknown;
  time?: EndingTelemetryTime | null;
  source?: string | null;
  extra?: Record<string, unknown>;
};

function asSafeString(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) return trimmed.slice(0, 120);
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function asTelemetryList(value: unknown, cap: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const text = String(item ?? "").trim();
    if (!text) continue;
    out.push(text.slice(0, 160));
    if (out.length >= cap) break;
  }
  return out;
}

function asNonNegativeInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

function computeSurvivalHours(time?: EndingTelemetryTime | null): number {
  return asNonNegativeInt(time?.day) * 24 + asNonNegativeInt(time?.hour);
}

export function buildEndingTelemetryPayload(input: BuildEndingTelemetryPayloadInput): EndingTelemetryPayload {
  const endingState = input.endingState ?? null;
  const eligibility = endingState?.eligibility ?? null;
  const snapshot = endingState?.settlementSnapshot ?? null;
  const outcome = eligibility?.outcome ?? snapshot?.outcome ?? null;
  const source = input.source ?? eligibility?.source ?? "unknown";

  return {
    runId: asSafeString(input.runId ?? snapshot?.runId, "unknown_run"),
    outcome,
    endingPhase: endingState?.phase ?? "playing",
    detectedAtTurn: typeof eligibility?.detectedAtTurn === "number" ? eligibility.detectedAtTurn : null,
    idempotencyKey: endingState?.idempotencyKey ?? null,
    reasons: asTelemetryList(eligibility?.reasons, 12),
    blockers: asTelemetryList(eligibility?.blockers, 12),
    escapeStage: asSafeString(input.escapeStage, "unknown"),
    survivalHours: snapshot?.survivalHours ?? computeSurvivalHours(input.time),
    source,
    snapshotPresent: Boolean(snapshot),
    settlementId: snapshot?.settlementId ?? null,
    ...(input.extra ?? {}),
  };
}

export function buildEndingTelemetryIdempotencyKey(
  eventName: EndingTelemetryEventName,
  payload: Pick<EndingTelemetryPayload, "runId" | "outcome" | "endingPhase" | "detectedAtTurn" | "idempotencyKey">,
  suffix?: string | null
): string {
  const base = [
    eventName,
    payload.runId || "unknown_run",
    payload.outcome || "none",
    payload.detectedAtTurn ?? "na",
    payload.endingPhase || "unknown_phase",
    payload.idempotencyKey || "no_ending_key",
    suffix || "default",
  ];
  return base.map((part) => String(part).replaceAll(":", "_").slice(0, 96)).join(":");
}
