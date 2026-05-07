import { envRaw } from "@/lib/config/envRaw";
import type { PacingValidationReport } from "@/lib/turnEngine/pacing";
import type {
  NarrativeSafetyIssue,
  NarrativeSafetyIssueCode,
  NarrativeSafetyReport,
} from "@/lib/turnEngine/narrativeSafety/types";

export type NarrativeSafetyRuntimeMode = "shadow" | "soft" | "hard";

export type NarrativeSafetyRuntimeConfig = {
  kernelEnabled: boolean;
  mode: NarrativeSafetyRuntimeMode;
  entityHardGateEnabled: boolean;
  pacingValidatorEnabled: boolean;
  logSampleRate: number;
};

export type NarrativeSafetyCommitPolicy = Pick<
  NarrativeSafetyRuntimeConfig,
  "kernelEnabled" | "mode" | "entityHardGateEnabled" | "pacingValidatorEnabled"
> & {
  laneRequiresHardGate?: boolean;
};

export type NarrativeSafetyEnforcementPlan = {
  enabled: boolean;
  mode: NarrativeSafetyRuntimeMode;
  shouldFallback: boolean;
  shouldBlockCommit: boolean;
  entityHardGateTriggered: boolean;
  pacingHardGateTriggered: boolean;
  promptInjectionBlocked: boolean;
  highSeverityBlocked: boolean;
  decision: "pass" | "record" | "repair" | "fallback" | "block_commit";
};

export const NARRATIVE_SAFETY_DEFAULT_CONFIG: NarrativeSafetyRuntimeConfig = {
  kernelEnabled: true,
  mode: "hard",
  entityHardGateEnabled: true,
  pacingValidatorEnabled: true,
  logSampleRate: 0.1,
};

const ZERO_TOLERANCE_ENTITY_CODES = new Set<NarrativeSafetyIssueCode>([
  "unknown_entity_surface",
  "unregistered_npc_id",
  "offscreen_npc_direct_speech",
  "speaker_not_present",
  "npc_status_forbidden_direct_speech",
  "npc_mentions_unknown_npc",
  "unsupported_relationship_claim",
  "unsupported_location_claim",
]);

const PROMPT_INJECTION_CODES = new Set<NarrativeSafetyIssueCode>([
  "prompt_injection_entity_creation_attempt",
]);

function rawFrom(env: Record<string, string | undefined> | undefined, name: string): string | undefined {
  const value = env ? env[name] : envRaw(name);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readBoolean(
  env: Record<string, string | undefined> | undefined,
  name: string,
  fallback: boolean
): boolean {
  const value = rawFrom(env, name);
  if (!value) return fallback;
  const normalized = value.toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  return fallback;
}

function readMode(
  env: Record<string, string | undefined> | undefined,
  fallback: NarrativeSafetyRuntimeMode
): NarrativeSafetyRuntimeMode {
  const value = rawFrom(env, "VC_NARRATIVE_SAFETY_MODE")?.toLowerCase();
  if (value === "shadow" || value === "soft" || value === "hard") return value;
  return fallback;
}

function readSampleRate(
  env: Record<string, string | undefined> | undefined,
  fallback: number
): number {
  const raw = rawFrom(env, "VC_NARRATIVE_SAFETY_LOG_SAMPLE_RATE");
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

export function resolveNarrativeSafetyRuntimeConfig(
  env?: Record<string, string | undefined>
): NarrativeSafetyRuntimeConfig {
  return {
    kernelEnabled: readBoolean(
      env,
      "VC_ENABLE_NARRATIVE_SAFETY_KERNEL",
      NARRATIVE_SAFETY_DEFAULT_CONFIG.kernelEnabled
    ),
    mode: readMode(env, NARRATIVE_SAFETY_DEFAULT_CONFIG.mode),
    entityHardGateEnabled: readBoolean(
      env,
      "VC_ENABLE_ENTITY_HARD_GATE",
      NARRATIVE_SAFETY_DEFAULT_CONFIG.entityHardGateEnabled
    ),
    pacingValidatorEnabled: readBoolean(
      env,
      "VC_ENABLE_PACING_VALIDATOR",
      NARRATIVE_SAFETY_DEFAULT_CONFIG.pacingValidatorEnabled
    ),
    logSampleRate: readSampleRate(env, NARRATIVE_SAFETY_DEFAULT_CONFIG.logSampleRate),
  };
}

export function getNarrativeSafetyRuntimeConfig(): NarrativeSafetyRuntimeConfig {
  return resolveNarrativeSafetyRuntimeConfig();
}

function hasIssue(
  issues: readonly NarrativeSafetyIssue[],
  predicate: (issue: NarrativeSafetyIssue) => boolean
): boolean {
  return issues.some(predicate);
}

function hasPacingHighIssue(report: PacingValidationReport | null | undefined): boolean {
  return Boolean(report?.issues.some((issue) => issue.severity === "high"));
}

function hasPacingMediumOrHighIssue(report: PacingValidationReport | null | undefined): boolean {
  return Boolean(report?.issues.some((issue) => issue.severity === "high" || issue.severity === "medium"));
}

function hasHighSafetyIssue(report: NarrativeSafetyReport | null | undefined): boolean {
  return Boolean(report?.issues.some((issue) => issue.severity === "high"));
}

export function isZeroToleranceEntityIssue(issue: NarrativeSafetyIssue): boolean {
  return ZERO_TOLERANCE_ENTITY_CODES.has(issue.code);
}

export function isPromptInjectionIssue(issue: NarrativeSafetyIssue): boolean {
  return PROMPT_INJECTION_CODES.has(issue.code);
}

export function planNarrativeSafetyEnforcement(args: {
  safetyReport?: NarrativeSafetyReport | null;
  pacingReport?: PacingValidationReport | null;
  policy?: NarrativeSafetyCommitPolicy | null;
}): NarrativeSafetyEnforcementPlan {
  const policy: NarrativeSafetyCommitPolicy = {
    ...NARRATIVE_SAFETY_DEFAULT_CONFIG,
    laneRequiresHardGate: true,
    ...(args.policy ?? {}),
  };
  const issues = args.safetyReport?.issues ?? [];
  const enabled = policy.kernelEnabled;
  const mode = policy.mode;
  const laneRequiresHardGate = policy.laneRequiresHardGate !== false;
  const hasMediumOrHighSafety = hasIssue(
    issues,
    (issue) => issue.severity === "high" || issue.severity === "medium"
  );
  const hasHighNonEntitySafety = hasIssue(
    issues,
    (issue) => issue.severity === "high" && !isZeroToleranceEntityIssue(issue)
  );
  const entityHardGateTriggered =
    enabled &&
    mode !== "shadow" &&
    policy.entityHardGateEnabled &&
    hasIssue(issues, (issue) => issue.severity !== "low" && isZeroToleranceEntityIssue(issue));
  const promptInjectionBlocked =
    enabled &&
    mode !== "shadow" &&
    hasIssue(issues, (issue) => issue.severity !== "low" && isPromptInjectionIssue(issue));
  const pacingHardGateTriggered =
    enabled &&
    mode === "hard" &&
    policy.pacingValidatorEnabled &&
    laneRequiresHardGate &&
    hasPacingHighIssue(args.pacingReport);
  const highSeverityBlocked =
    enabled &&
    mode === "hard" &&
    laneRequiresHardGate &&
    hasHighNonEntitySafety;
  const softFallback =
    enabled &&
    mode === "soft" &&
    (hasMediumOrHighSafety || (policy.pacingValidatorEnabled && hasPacingMediumOrHighIssue(args.pacingReport)));
  const hardFallback =
    enabled &&
    mode === "hard" &&
    laneRequiresHardGate &&
    (hasHighSafetyIssue(args.safetyReport) || (policy.pacingValidatorEnabled && hasPacingHighIssue(args.pacingReport)));

  if (!enabled) {
    return {
      enabled,
      mode,
      shouldFallback: false,
      shouldBlockCommit: false,
      entityHardGateTriggered: false,
      pacingHardGateTriggered: false,
      promptInjectionBlocked: false,
      highSeverityBlocked: false,
      decision: "pass",
    };
  }

  if (mode === "shadow") {
    return {
      enabled,
      mode,
      shouldFallback: false,
      shouldBlockCommit: false,
      entityHardGateTriggered: false,
      pacingHardGateTriggered: false,
      promptInjectionBlocked: false,
      highSeverityBlocked: false,
      decision: issues.length > 0 || (args.pacingReport?.issues.length ?? 0) > 0 ? "record" : "pass",
    };
  }

  const shouldBlockCommit =
    entityHardGateTriggered ||
    promptInjectionBlocked ||
    pacingHardGateTriggered ||
    highSeverityBlocked;
  const shouldFallback = shouldBlockCommit || softFallback || hardFallback;
  return {
    enabled,
    mode,
    shouldFallback,
    shouldBlockCommit,
    entityHardGateTriggered,
    pacingHardGateTriggered,
    promptInjectionBlocked,
    highSeverityBlocked,
    decision: shouldBlockCommit ? "block_commit" : shouldFallback ? "fallback" : issues.length > 0 ? "repair" : "pass",
  };
}
