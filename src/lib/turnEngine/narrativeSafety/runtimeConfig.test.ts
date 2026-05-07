import test from "node:test";
import assert from "node:assert/strict";
import {
  planNarrativeSafetyEnforcement,
  resolveNarrativeSafetyRuntimeConfig,
} from "@/lib/turnEngine/narrativeSafety/runtimeConfig";
import type {
  NarrativeSafetyIssue,
  NarrativeSafetyReport,
  NarrativeSafetySeverity,
} from "@/lib/turnEngine/narrativeSafety/types";
import type { PacingValidationReport } from "@/lib/turnEngine/pacing";

function issue(overrides: Partial<NarrativeSafetyIssue> = {}): NarrativeSafetyIssue {
  return {
    code: "unsupported_root_cause_claim",
    severity: "high",
    source: "unsupportedFactDetector",
    detail: "redacted detail",
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
    decision: issues.some((item) => item.severity === "high")
      ? "fallback"
      : issues.some((item) => item.severity === "medium")
        ? "repair"
        : "pass",
    issues,
    invariantsViolated: [],
    maxSeverity: issues.some((item) => item.severity === "high")
      ? "high"
      : issues.some((item) => item.severity === "medium")
        ? "medium"
        : issues.some((item) => item.severity === "low")
          ? "low"
          : null,
    telemetry: {
      totalIssues: issues.length,
      byCode,
      bySeverity,
      bySource,
    },
  };
}

function pacingReport(severity: "medium" | "high"): PacingValidationReport {
  return {
    ok: false,
    issues: [{ code: "consecutive_peak", severity, detail: "redacted" }],
    maxSeverity: severity,
    telemetry: {
      totalIssues: 1,
      byCode: { consecutive_peak: 1 },
      bySeverity: { low: 0, medium: severity === "medium" ? 1 : 0, high: severity === "high" ? 1 : 0 },
      lane: "RULE",
      previousBeatState: "peak",
      candidateBeatState: "peak",
      strongFactCount: 0,
      majorRevealCount: 0,
      allowedMajorRevealCount: 0,
    },
  };
}

test("resolveNarrativeSafetyRuntimeConfig parses rollout env values", () => {
  const config = resolveNarrativeSafetyRuntimeConfig({
    VC_ENABLE_NARRATIVE_SAFETY_KERNEL: "0",
    VC_NARRATIVE_SAFETY_MODE: "shadow",
    VC_ENABLE_ENTITY_HARD_GATE: "false",
    VC_ENABLE_PACING_VALIDATOR: "yes",
    VC_NARRATIVE_SAFETY_LOG_SAMPLE_RATE: "2",
  });

  assert.equal(config.kernelEnabled, false);
  assert.equal(config.mode, "shadow");
  assert.equal(config.entityHardGateEnabled, false);
  assert.equal(config.pacingValidatorEnabled, true);
  assert.equal(config.logSampleRate, 1);
});

test("shadow mode records high issues without fallback or block", () => {
  const plan = planNarrativeSafetyEnforcement({
    safetyReport: safetyReport([issue()]),
    policy: {
      kernelEnabled: true,
      mode: "shadow",
      entityHardGateEnabled: true,
      pacingValidatorEnabled: true,
    },
  });

  assert.equal(plan.decision, "record");
  assert.equal(plan.shouldFallback, false);
  assert.equal(plan.shouldBlockCommit, false);
});

test("hard mode blocks high non-entity issues", () => {
  const plan = planNarrativeSafetyEnforcement({
    safetyReport: safetyReport([issue()]),
    policy: {
      kernelEnabled: true,
      mode: "hard",
      entityHardGateEnabled: true,
      pacingValidatorEnabled: true,
    },
  });

  assert.equal(plan.decision, "block_commit");
  assert.equal(plan.shouldFallback, true);
  assert.equal(plan.shouldBlockCommit, true);
  assert.equal(plan.highSeverityBlocked, true);
});

test("soft mode falls back for high non-entity issues without blocking commit", () => {
  const plan = planNarrativeSafetyEnforcement({
    safetyReport: safetyReport([issue()]),
    policy: {
      kernelEnabled: true,
      mode: "soft",
      entityHardGateEnabled: true,
      pacingValidatorEnabled: true,
    },
  });

  assert.equal(plan.decision, "fallback");
  assert.equal(plan.shouldFallback, true);
  assert.equal(plan.shouldBlockCommit, false);
});

test("hard mode records medium non-entity issues without full fallback", () => {
  const plan = planNarrativeSafetyEnforcement({
    safetyReport: safetyReport([
      issue({
        code: "narrative_style_bridge",
        severity: "medium",
        source: "validateNarrative",
      }),
    ]),
    policy: {
      kernelEnabled: true,
      mode: "hard",
      entityHardGateEnabled: true,
      pacingValidatorEnabled: true,
    },
  });

  assert.equal(plan.decision, "repair");
  assert.equal(plan.shouldFallback, false);
  assert.equal(plan.shouldBlockCommit, false);
});

test("soft mode still blocks zero-tolerance entity issues", () => {
  const plan = planNarrativeSafetyEnforcement({
    safetyReport: safetyReport([
      issue({
        code: "unknown_entity_surface",
        invariant: "unknown_entity_surface",
        severity: "medium",
        source: "entityAudit",
      }),
    ]),
    policy: {
      kernelEnabled: true,
      mode: "soft",
      entityHardGateEnabled: true,
      pacingValidatorEnabled: true,
    },
  });

  assert.equal(plan.decision, "block_commit");
  assert.equal(plan.entityHardGateTriggered, true);
  assert.equal(plan.shouldBlockCommit, true);
});

test("disabled kernel returns to the old no-op safety path", () => {
  const plan = planNarrativeSafetyEnforcement({
    safetyReport: safetyReport([issue()]),
    pacingReport: pacingReport("high"),
    policy: {
      kernelEnabled: false,
      mode: "hard",
      entityHardGateEnabled: true,
      pacingValidatorEnabled: true,
    },
  });

  assert.equal(plan.enabled, false);
  assert.equal(plan.decision, "pass");
  assert.equal(plan.shouldFallback, false);
  assert.equal(plan.shouldBlockCommit, false);
});

test("pacing validator switch controls pacing hard gates", () => {
  const enabledPlan = planNarrativeSafetyEnforcement({
    pacingReport: pacingReport("high"),
    policy: {
      kernelEnabled: true,
      mode: "hard",
      entityHardGateEnabled: true,
      pacingValidatorEnabled: true,
    },
  });
  const disabledPlan = planNarrativeSafetyEnforcement({
    pacingReport: pacingReport("high"),
    policy: {
      kernelEnabled: true,
      mode: "hard",
      entityHardGateEnabled: true,
      pacingValidatorEnabled: false,
    },
  });

  assert.equal(enabledPlan.pacingHardGateTriggered, true);
  assert.equal(disabledPlan.pacingHardGateTriggered, false);
  assert.equal(disabledPlan.shouldBlockCommit, false);
});
