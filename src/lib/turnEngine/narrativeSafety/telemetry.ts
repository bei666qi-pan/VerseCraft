import { createHash } from "node:crypto";
import type { AnalyticsEventName } from "@/lib/analytics/types";
import type { PacingValidationReport } from "@/lib/turnEngine/pacing";
import type { TurnLane } from "@/lib/turnEngine/types";
import type { TurnCommitSummary } from "@/lib/turnEngine/commitTurn";
import type {
  NarrativeSafetyIssueCode,
  NarrativeSafetyReport,
  NarrativeSafetySeverity,
} from "@/lib/turnEngine/narrativeSafety/types";
import type {
  NarrativeSafetyEnforcementPlan,
  NarrativeSafetyRuntimeConfig,
} from "@/lib/turnEngine/narrativeSafety/runtimeConfig";

export type NarrativeSafetyTelemetryEventName =
  | "narrative_safety_issue"
  | "narrative_safety_commit"
  | "entity_audit_issue"
  | "pacing_validator_issue"
  | "safety_fallback_used"
  | "unknown_entity_blocked"
  | "prompt_injection_blocked";

export type NarrativeSafetyAnalyticsEvent = {
  eventName: NarrativeSafetyTelemetryEventName;
  payload: Record<string, unknown>;
};

export type NarrativeSafetyTelemetryRingEntry = {
  ts: string;
  eventName: NarrativeSafetyTelemetryEventName;
  requestId: string;
  sessionIdHash: string | null;
  issueCodes: string[];
  byCode: Record<string, number>;
  bySeverity: Record<NarrativeSafetySeverity, number>;
  decision: string;
  mode: NarrativeSafetyRuntimeConfig["mode"];
  lane: TurnLane | null;
  fallbackApplied: boolean;
  blockedCommitFields: string[];
};

export type NarrativeSafetyTelemetrySummary = {
  mode: NarrativeSafetyRuntimeConfig["mode"];
  kernelEnabled: boolean;
  entityHardGateEnabled: boolean;
  pacingValidatorEnabled: boolean;
  logSampleRate: number;
  issueCodeDistribution: Record<string, number>;
  fallbackCount: number;
  unknownEntityBlockedCount: number;
  pacingBreachCount: number;
  promptInjectionBlockedCount: number;
  recent: NarrativeSafetyTelemetryRingEntry[];
};

const MAX_RING = 120;
const ring: NarrativeSafetyTelemetryRingEntry[] = [];

function stableHash(value: string | null | undefined): string | null {
  if (!value) return null;
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function hashToUnitInterval(value: string): number {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 8);
  return Number.parseInt(hex, 16) / 0xffffffff;
}

function countPacingIssues(report: PacingValidationReport | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const issue of report?.issues ?? []) {
    out[issue.code] = (out[issue.code] ?? 0) + 1;
  }
  return out;
}

function mergeCounts(
  a: Partial<Record<string, number>>,
  b: Partial<Record<string, number>>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(a)) {
    if (typeof value === "number" && value > 0) out[key] = (out[key] ?? 0) + value;
  }
  for (const [key, value] of Object.entries(b)) {
    if (typeof value === "number" && value > 0) out[key] = (out[key] ?? 0) + value;
  }
  return out;
}

function issueCodes(report: NarrativeSafetyReport | null | undefined): NarrativeSafetyIssueCode[] {
  return [...new Set((report?.issues ?? []).map((issue) => issue.code))];
}

function hasCode(report: NarrativeSafetyReport | null | undefined, codes: readonly string[]): boolean {
  const wanted = new Set(codes);
  return (report?.issues ?? []).some((issue) => wanted.has(issue.code));
}

export function shouldSampleNarrativeSafetyTelemetry(args: {
  requestId: string;
  config: Pick<NarrativeSafetyRuntimeConfig, "logSampleRate">;
  hasIssue: boolean;
  fallbackApplied: boolean;
  blocked: boolean;
}): boolean {
  if (args.hasIssue || args.fallbackApplied || args.blocked) return true;
  if (args.config.logSampleRate >= 1) return true;
  if (args.config.logSampleRate <= 0) return false;
  return hashToUnitInterval(args.requestId) < args.config.logSampleRate;
}

export function buildNarrativeSafetyTelemetryEvents(args: {
  requestId: string;
  sessionId: string | null;
  turnIndex: number;
  config: NarrativeSafetyRuntimeConfig;
  enforcement: NarrativeSafetyEnforcementPlan;
  safetyReport?: NarrativeSafetyReport | null;
  pacingReport?: PacingValidationReport | null;
  commitSummary?: TurnCommitSummary | null;
  lane: TurnLane | null;
  laneReasons?: readonly string[];
  model?: string | null;
  task?: string | null;
}): NarrativeSafetyAnalyticsEvent[] {
  const byCode = mergeCounts(args.safetyReport?.telemetry.byCode ?? {}, countPacingIssues(args.pacingReport));
  const bySeverity = args.safetyReport?.telemetry.bySeverity ?? { low: 0, medium: 0, high: 0 };
  const codes = [...new Set([...issueCodes(args.safetyReport), ...Object.keys(countPacingIssues(args.pacingReport))])];
  const blockedCommitFields = args.commitSummary?.blockedCommitFields ?? [];
  const fallbackApplied = Boolean(args.commitSummary?.fallbackApplied || args.enforcement.shouldFallback);
  const blocked = blockedCommitFields.length > 0 || args.enforcement.shouldBlockCommit;
  const hasIssue = codes.length > 0 || (args.pacingReport?.issues.length ?? 0) > 0;
  if (
    !shouldSampleNarrativeSafetyTelemetry({
      requestId: args.requestId,
      config: args.config,
      hasIssue,
      fallbackApplied,
      blocked,
    })
  ) {
    return [];
  }

  const basePayload = {
    requestId: args.requestId,
    sessionIdHash: stableHash(args.sessionId),
    turnIndex: args.turnIndex,
    mode: args.config.mode,
    kernelEnabled: args.config.kernelEnabled,
    entityHardGateEnabled: args.config.entityHardGateEnabled,
    pacingValidatorEnabled: args.config.pacingValidatorEnabled,
    decision: args.enforcement.decision,
    safetyDecision: args.safetyReport?.decision ?? "disabled",
    lane: args.lane,
    laneReasons: [...(args.laneReasons ?? [])],
    model: args.model ?? null,
    task: args.task ?? "PLAYER_CHAT",
    issueCodes: codes,
    byCode,
    bySeverity,
    totalIssues: args.safetyReport?.telemetry.totalIssues ?? 0,
    pacingIssueCount: args.pacingReport?.issues.length ?? 0,
    fallbackApplied,
    blockedCommitFields,
    entityHardGateTriggered: args.enforcement.entityHardGateTriggered,
    pacingHardGateTriggered: args.enforcement.pacingHardGateTriggered,
    promptInjectionBlocked: args.enforcement.promptInjectionBlocked,
    highSeverityBlocked: args.enforcement.highSeverityBlocked,
  };

  const events: NarrativeSafetyAnalyticsEvent[] = [{ eventName: "narrative_safety_commit", payload: basePayload }];
  if (hasIssue) events.push({ eventName: "narrative_safety_issue", payload: basePayload });
  if (hasCode(args.safetyReport, ["unknown_entity_surface", "unregistered_npc_id", "speaker_not_present", "offscreen_npc_direct_speech"])) {
    events.push({ eventName: "entity_audit_issue", payload: basePayload });
  }
  if ((args.pacingReport?.issues.length ?? 0) > 0 || byCode.pacing_budget_breach) {
    events.push({ eventName: "pacing_validator_issue", payload: basePayload });
  }
  if (fallbackApplied) events.push({ eventName: "safety_fallback_used", payload: basePayload });
  if (args.enforcement.entityHardGateTriggered) {
    events.push({ eventName: "unknown_entity_blocked", payload: basePayload });
  }
  if (args.enforcement.promptInjectionBlocked) {
    events.push({ eventName: "prompt_injection_blocked", payload: basePayload });
  }
  return events;
}

export function pushNarrativeSafetyTelemetryEvent(event: NarrativeSafetyAnalyticsEvent): void {
  const payload = event.payload;
  const entry: NarrativeSafetyTelemetryRingEntry = {
    ts: new Date().toISOString(),
    eventName: event.eventName,
    requestId: String(payload.requestId ?? ""),
    sessionIdHash: typeof payload.sessionIdHash === "string" ? payload.sessionIdHash : null,
    issueCodes: Array.isArray(payload.issueCodes)
      ? payload.issueCodes.filter((item): item is string => typeof item === "string")
      : [],
    byCode:
      payload.byCode && typeof payload.byCode === "object" && !Array.isArray(payload.byCode)
        ? { ...(payload.byCode as Record<string, number>) }
        : {},
    bySeverity:
      payload.bySeverity && typeof payload.bySeverity === "object" && !Array.isArray(payload.bySeverity)
        ? ({ ...(payload.bySeverity as Record<NarrativeSafetySeverity, number>) } as Record<NarrativeSafetySeverity, number>)
        : { low: 0, medium: 0, high: 0 },
    decision: String(payload.decision ?? "pass"),
    mode: payload.mode === "shadow" || payload.mode === "soft" || payload.mode === "hard" ? payload.mode : "hard",
    lane:
      payload.lane === "FAST" || payload.lane === "RULE" || payload.lane === "REVEAL"
        ? payload.lane
        : null,
    fallbackApplied: payload.fallbackApplied === true,
    blockedCommitFields: Array.isArray(payload.blockedCommitFields)
      ? payload.blockedCommitFields.filter((item): item is string => typeof item === "string")
      : [],
  };
  ring.unshift(entry);
  if (ring.length > MAX_RING) ring.length = MAX_RING;
}

export function resetNarrativeSafetyTelemetryRing(): void {
  ring.length = 0;
}

export function listRecentNarrativeSafetyTelemetry(): NarrativeSafetyTelemetryRingEntry[] {
  return ring.map((entry) => ({
    ...entry,
    issueCodes: [...entry.issueCodes],
    byCode: { ...entry.byCode },
    bySeverity: { ...entry.bySeverity },
    blockedCommitFields: [...entry.blockedCommitFields],
  }));
}

export function getNarrativeSafetyTelemetrySummary(
  config: NarrativeSafetyRuntimeConfig
): NarrativeSafetyTelemetrySummary {
  const issueCodeDistribution: Record<string, number> = {};
  const fallbackRequestIds = new Set<string>();
  const unknownEntityBlockedRequestIds = new Set<string>();
  const pacingBreachRequestIds = new Set<string>();
  const promptInjectionBlockedRequestIds = new Set<string>();
  const countedIssueKeys = new Set<string>();
  for (const entry of ring) {
    if (entry.fallbackApplied || entry.eventName === "safety_fallback_used") fallbackRequestIds.add(entry.requestId);
    if (entry.eventName === "unknown_entity_blocked") unknownEntityBlockedRequestIds.add(entry.requestId);
    if (entry.eventName === "pacing_validator_issue") pacingBreachRequestIds.add(entry.requestId);
    if (entry.eventName === "prompt_injection_blocked") promptInjectionBlockedRequestIds.add(entry.requestId);
    for (const [code, count] of Object.entries(entry.byCode)) {
      const issueKey = `${entry.requestId}:${code}`;
      if (typeof count === "number" && count > 0 && !countedIssueKeys.has(issueKey)) {
        countedIssueKeys.add(issueKey);
        issueCodeDistribution[code] = (issueCodeDistribution[code] ?? 0) + count;
      }
    }
  }
  return {
    mode: config.mode,
    kernelEnabled: config.kernelEnabled,
    entityHardGateEnabled: config.entityHardGateEnabled,
    pacingValidatorEnabled: config.pacingValidatorEnabled,
    logSampleRate: config.logSampleRate,
    issueCodeDistribution,
    fallbackCount: fallbackRequestIds.size,
    unknownEntityBlockedCount: unknownEntityBlockedRequestIds.size,
    pacingBreachCount: pacingBreachRequestIds.size,
    promptInjectionBlockedCount: promptInjectionBlockedRequestIds.size,
    recent: listRecentNarrativeSafetyTelemetry().slice(0, 20),
  };
}

export function asAnalyticsEventName(name: NarrativeSafetyTelemetryEventName): AnalyticsEventName {
  return name;
}
