import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNarrativeSafetyTelemetryEvents,
  getNarrativeSafetyTelemetrySummary,
  pushNarrativeSafetyTelemetryEvent,
  resetNarrativeSafetyTelemetryRing,
} from "@/lib/turnEngine/narrativeSafety/telemetry";
import type { TurnCommitSummary } from "@/lib/turnEngine/commitTurn";
import type {
  NarrativeSafetyIssue,
  NarrativeSafetyReport,
  NarrativeSafetySeverity,
} from "@/lib/turnEngine/narrativeSafety/types";
import type { NarrativeSafetyEnforcementPlan } from "@/lib/turnEngine/narrativeSafety/runtimeConfig";
import type { PacingValidationReport } from "@/lib/turnEngine/pacing";

function issue(overrides: Partial<NarrativeSafetyIssue> = {}): NarrativeSafetyIssue {
  return {
    code: "unknown_entity_surface",
    invariant: "unknown_entity_surface",
    severity: "high",
    source: "entityAudit",
    detail: "SECRET_FULL_NARRATIVE: Avia appears and tells the root truth.",
    anchor: "Avia",
    ...overrides,
  };
}

function safetyReport(issues: NarrativeSafetyIssue[]): NarrativeSafetyReport {
  const bySeverity: Record<NarrativeSafetySeverity, number> = { low: 0, medium: 0, high: 0 };
  const byCode: NarrativeSafetyReport["telemetry"]["byCode"] = {};
  const bySource: NarrativeSafetyReport["telemetry"]["bySource"] = {};
  for (const item of issues) {
    bySeverity[item.severity] += 1;
    byCode[item.code] = (byCode[item.code] ?? 0) + 1;
    bySource[item.source] = (bySource[item.source] ?? 0) + 1;
  }
  return {
    ok: issues.length === 0,
    decision: issues.some((item) => item.severity === "high") ? "block_commit" : "pass",
    issues,
    invariantsViolated: ["unknown_entity_surface"],
    maxSeverity: issues.some((item) => item.severity === "high") ? "high" : null,
    telemetry: {
      totalIssues: issues.length,
      byCode,
      bySeverity,
      bySource,
    },
  };
}

function enforcement(overrides: Partial<NarrativeSafetyEnforcementPlan> = {}): NarrativeSafetyEnforcementPlan {
  return {
    enabled: true,
    mode: "hard",
    shouldFallback: true,
    shouldBlockCommit: true,
    entityHardGateTriggered: true,
    pacingHardGateTriggered: false,
    promptInjectionBlocked: false,
    highSeverityBlocked: false,
    decision: "block_commit",
    ...overrides,
  };
}

function pacingReport(): PacingValidationReport {
  return {
    ok: false,
    issues: [{ code: "consecutive_peak", severity: "high", detail: "redacted" }],
    maxSeverity: "high",
    telemetry: {
      totalIssues: 1,
      byCode: { consecutive_peak: 1 },
      bySeverity: { low: 0, medium: 0, high: 1 },
      lane: "RULE",
      previousBeatState: "peak",
      candidateBeatState: "peak",
      strongFactCount: 0,
      majorRevealCount: 1,
      allowedMajorRevealCount: 0,
    },
  };
}

function commitSummary(overrides: Partial<TurnCommitSummary> = {}): TurnCommitSummary {
  return {
    requestId: "req_telemetry",
    sessionId: "session_private",
    turnIndex: 1,
    isActionLegal: true,
    degraded: true,
    optionsRewriteApplied: false,
    safeNarrativeFallbackApplied: true,
    playerLocation: null,
    deltaSummary: {
      consumesTime: false,
      timeCost: null,
      sanityDamage: 0,
      hpDelta: null,
      originiumDelta: null,
      isDeath: false,
      npcLocationUpdates: 0,
      npcAttitudeUpdates: 0,
      taskUpdates: 0,
      newTasks: 0,
    },
    validatorIssueCounts: {},
    safetyIssueCounts: { unknown_entity_surface: 1 },
    pacingIssueCounts: {},
    blockedCommitFields: ["codex_updates"],
    fallbackApplied: true,
    entityAuditSummary: {
      strippedFields: { codex_updates: 1 },
      strippedUnknownEntityCount: 1,
      highIssueCount: 1,
      mediumIssueCount: 0,
    },
    narrativeGovernanceTelemetry: {
      styleIssueCount: 0,
      styleDriftCount: 0,
      mechanicalExpositionCount: 0,
      npcKnowledgeIssueCount: 0,
      rootCauseLeakCount: 0,
      unsupportedFactCount: 0,
      unsupportedRelationshipClaimCount: 0,
      factCommitRejectedCount: 0,
      narrativeGovernanceFinalSafe: true,
    },
    commitFlags: ["safe_narrative_fallback_applied", "structured_updates_stripped"],
    ...overrides,
  };
}

test("telemetry payload omits full narrative, issue detail, anchors, and raw session id", () => {
  const events = buildNarrativeSafetyTelemetryEvents({
    requestId: "req_privacy",
    sessionId: "session_private",
    turnIndex: 2,
    config: {
      kernelEnabled: true,
      mode: "hard",
      entityHardGateEnabled: true,
      pacingValidatorEnabled: true,
      logSampleRate: 0,
    },
    enforcement: enforcement(),
    safetyReport: safetyReport([issue()]),
    commitSummary: commitSummary(),
    lane: "RULE",
    model: "mock-model",
    task: "PLAYER_CHAT",
  });

  assert.ok(events.length > 0);
  const serialized = JSON.stringify(events);
  assert.ok(!serialized.includes("SECRET_FULL_NARRATIVE"));
  assert.ok(!serialized.includes("Avia appears"));
  assert.ok(!serialized.includes("session_private"));
  assert.ok(serialized.includes("sessionIdHash"));
  assert.ok(serialized.includes("unknown_entity_surface"));
});

test("issue and fallback telemetry bypasses sample rate zero", () => {
  const events = buildNarrativeSafetyTelemetryEvents({
    requestId: "req_sample_0",
    sessionId: null,
    turnIndex: 3,
    config: {
      kernelEnabled: true,
      mode: "hard",
      entityHardGateEnabled: true,
      pacingValidatorEnabled: true,
      logSampleRate: 0,
    },
    enforcement: enforcement(),
    safetyReport: safetyReport([issue()]),
    commitSummary: commitSummary(),
    lane: "RULE",
  });

  assert.ok(events.some((event) => event.eventName === "narrative_safety_issue"));
  assert.ok(events.some((event) => event.eventName === "safety_fallback_used"));
  assert.ok(events.some((event) => event.eventName === "unknown_entity_blocked"));
});

test("telemetry summary exposes admin-safe rollout counters", () => {
  resetNarrativeSafetyTelemetryRing();
  const events = buildNarrativeSafetyTelemetryEvents({
    requestId: "req_summary",
    sessionId: "session_private",
    turnIndex: 4,
    config: {
      kernelEnabled: true,
      mode: "hard",
      entityHardGateEnabled: true,
      pacingValidatorEnabled: true,
      logSampleRate: 1,
    },
    enforcement: enforcement({ pacingHardGateTriggered: true }),
    safetyReport: safetyReport([issue()]),
    pacingReport: pacingReport(),
    commitSummary: commitSummary({ pacingIssueCounts: { consecutive_peak: 1 } }),
    lane: "REVEAL",
  });

  for (const event of events) pushNarrativeSafetyTelemetryEvent(event);
  const summary = getNarrativeSafetyTelemetrySummary({
    kernelEnabled: true,
    mode: "hard",
    entityHardGateEnabled: true,
    pacingValidatorEnabled: true,
    logSampleRate: 1,
  });

  assert.equal(summary.mode, "hard");
  assert.equal(summary.fallbackCount, 1);
  assert.equal(summary.unknownEntityBlockedCount, 1);
  assert.equal(summary.pacingBreachCount, 1);
  assert.equal(summary.issueCodeDistribution.unknown_entity_surface, 1);
  assert.equal(summary.issueCodeDistribution.consecutive_peak, 1);
  assert.ok(summary.recent.length > 0);
  resetNarrativeSafetyTelemetryRing();
});
