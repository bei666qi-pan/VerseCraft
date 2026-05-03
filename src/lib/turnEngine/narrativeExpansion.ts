import type { NarrativeBudget, NarrativeBudgetTier } from "@/lib/playRealtime/narrativeBudgetPackets";
import { sanitizeNarrativeLeakageForFinal } from "@/lib/playRealtime/protocolGuard";
import { countCompactChars } from "@/lib/turnEngine/narrativeLength";
import type { NarrativeLengthTelemetry } from "@/lib/turnEngine/narrativeLengthTelemetry";

export type NarrativeExpansionSkippedReason =
  | "feature_disabled"
  | "budget_missing"
  | "severity_not_medium"
  | "tier_not_expandable"
  | "safety_fallback"
  | "illegal_action"
  | "death"
  | "system_transition"
  | "protocol_or_safety_degrade"
  | "performance_budget_exhausted";

export type NarrativeExpansionTelemetry = {
  narrativeExpansionTriggered: boolean;
  narrativeExpansionSucceeded: boolean;
  narrativeExpansionSkippedReason: string | null;
  narrativeExpansionLatencyMs: number | null;
  narrativeBeforeChars: number | null;
  narrativeAfterChars: number | null;
};

export type NarrativeExpansionResult =
  | {
      ok: true;
      narrative: string;
      latencyMs: number;
      beforeChars: number;
      afterChars: number;
      ignoredFieldKeys: string[];
    }
  | {
      ok: false;
      reason: string;
      latencyMs: number;
      beforeChars: number;
      afterChars?: number;
      ignoredFieldKeys?: string[];
    };

export const NARRATIVE_EXPANDABLE_TIERS: ReadonlySet<NarrativeBudgetTier> = new Set([
  "standard",
  "reveal",
  "climax",
]);

const MIN_EXPANSION_GAIN_CHARS = 20;

const CONCLUSION_CHANGE_PATTERNS: RegExp[] = [
  /新增任务|任务完成|获得任务|任务失败/,
  /获得(?:了)?(?:道具|物品|钥匙|武器|徽章)/,
  /失去(?:了)?(?:道具|物品|钥匙|武器|徽章)/,
  /理智(?:下降|降低|归零|清零)|sanity_damage/i,
  /死亡|死去|死了|is_death/i,
  /传送|来到新的地点|进入新的地点|player_location/i,
  /关系(?:提升|降低|破裂)|relationship_updates/i,
];

export function shouldTriggerNarrativeExpansion(args: {
  enabled: boolean;
  budget?: NarrativeBudget | null;
  lengthTelemetry?: NarrativeLengthTelemetry | null;
  isSafetyFallback?: boolean;
  isActionLegal?: boolean;
  isDeath?: boolean;
  isSystemTransition?: boolean;
  hasProtocolOrSafetyDegrade?: boolean;
  performanceBudgetMs?: number | null;
}): { trigger: true; skippedReason: null } | { trigger: false; skippedReason: NarrativeExpansionSkippedReason } {
  if (!args.enabled) return { trigger: false, skippedReason: "feature_disabled" };
  if (!args.budget) return { trigger: false, skippedReason: "budget_missing" };
  if (args.lengthTelemetry?.narrativeLengthSeverity !== "medium") {
    return { trigger: false, skippedReason: "severity_not_medium" };
  }
  if (!NARRATIVE_EXPANDABLE_TIERS.has(args.budget.tier)) {
    return { trigger: false, skippedReason: "tier_not_expandable" };
  }
  if (args.isSafetyFallback) return { trigger: false, skippedReason: "safety_fallback" };
  if (args.isActionLegal === false) return { trigger: false, skippedReason: "illegal_action" };
  if (args.isDeath) return { trigger: false, skippedReason: "death" };
  if (args.isSystemTransition) return { trigger: false, skippedReason: "system_transition" };
  if (args.hasProtocolOrSafetyDegrade) {
    return { trigger: false, skippedReason: "protocol_or_safety_degrade" };
  }
  if (typeof args.performanceBudgetMs === "number" && args.performanceBudgetMs < 1500) {
    return { trigger: false, skippedReason: "performance_budget_exhausted" };
  }
  return { trigger: true, skippedReason: null };
}

export function emptyNarrativeExpansionTelemetry(
  skippedReason: NarrativeExpansionSkippedReason | null = null
): NarrativeExpansionTelemetry {
  return {
    narrativeExpansionTriggered: false,
    narrativeExpansionSucceeded: false,
    narrativeExpansionSkippedReason: skippedReason,
    narrativeExpansionLatencyMs: null,
    narrativeBeforeChars: null,
    narrativeAfterChars: null,
  };
}

export function narrativeExpansionTelemetryFromResult(
  result: NarrativeExpansionResult
): NarrativeExpansionTelemetry {
  return {
    narrativeExpansionTriggered: true,
    narrativeExpansionSucceeded: result.ok,
    narrativeExpansionSkippedReason: result.ok ? null : result.reason,
    narrativeExpansionLatencyMs: Math.max(0, Math.trunc(result.latencyMs)),
    narrativeBeforeChars: Math.max(0, Math.trunc(result.beforeChars)),
    narrativeAfterChars:
      typeof result.afterChars === "number" && Number.isFinite(result.afterChars)
        ? Math.max(0, Math.trunc(result.afterChars))
        : null,
  };
}

export function parseNarrativeExpansionJson(content: string):
  | { ok: true; narrative: string; ignoredFieldKeys: string[] }
  | { ok: false; reason: string } {
  const cleaned = String(content ?? "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, reason: "invalid_json_root" };
    }
    const obj = parsed as Record<string, unknown>;
    const narrative = typeof obj.narrative === "string" ? obj.narrative.trim() : "";
    if (!narrative) return { ok: false, reason: "empty_narrative" };
    return {
      ok: true,
      narrative,
      ignoredFieldKeys: Object.keys(obj).filter((key) => key !== "narrative"),
    };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}

export function validateExpandedNarrativeCandidate(args: {
  originalNarrative: string;
  candidateNarrative: string;
  budget: NarrativeBudget;
}):
  | { ok: true; narrative: string; beforeChars: number; afterChars: number }
  | { ok: false; reason: string; beforeChars: number; afterChars?: number } {
  const originalNarrative = String(args.originalNarrative ?? "");
  const beforeChars = countCompactChars(originalNarrative);
  const sanitized = sanitizeNarrativeLeakageForFinal(args.candidateNarrative);
  if (sanitized.degraded) {
    return { ok: false, reason: "protocol_leak", beforeChars };
  }

  const narrative = sanitized.narrative.trim();
  const afterChars = countCompactChars(narrative);
  if (!narrative || afterChars <= 0) return { ok: false, reason: "empty_narrative", beforeChars, afterChars };
  if (afterChars > Math.max(0, Math.round(args.budget.maxChars))) {
    return { ok: false, reason: "over_max_chars", beforeChars, afterChars };
  }
  if (afterChars < beforeChars + MIN_EXPANSION_GAIN_CHARS) {
    return { ok: false, reason: "not_expanded", beforeChars, afterChars };
  }
  if (introducesLikelyConclusionChange(originalNarrative, narrative)) {
    return { ok: false, reason: "changed_conclusion", beforeChars, afterChars };
  }

  return { ok: true, narrative, beforeChars, afterChars };
}

export function applyNarrativeExpansionResultToDmRecord<T extends Record<string, unknown>>(
  dmRecord: T,
  result: NarrativeExpansionResult
): T {
  if (!result.ok) return dmRecord;
  return { ...dmRecord, narrative: result.narrative };
}

function introducesLikelyConclusionChange(originalNarrative: string, candidateNarrative: string): boolean {
  return CONCLUSION_CHANGE_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    const candidateHas = pattern.test(candidateNarrative);
    pattern.lastIndex = 0;
    const originalHas = pattern.test(originalNarrative);
    return candidateHas && !originalHas;
  });
}
