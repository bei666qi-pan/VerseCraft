// src/lib/turnEngine/commitTurn.ts
/**
 * Phase-4: explicit turn commit step.
 *
 * Goal: separate "fact commitment" from "narrative generation". The authoritative
 * truth of what happened this turn is the `StateDelta`; the narrative is only
 * the presentation layer. `commitTurn` consumes:
 *
 *   - the candidate DM record (post-render / post-resolver),
 *   - the `StateDelta`,
 *   - the `NarrativeValidationReport`,
 *
 * and returns:
 *
 *   - the committed DM record with any validator overrides applied,
 *   - a structured `TurnCommitSummary` suitable for analytics / telemetry.
 *
 * This module is *pure*. All IO (analytics insert, writer.write, DB write)
 * stays in the caller (`route.ts`). This keeps `commitTurn` unit-testable
 * and makes the audit trail of "what committed" independent from "what was
 * actually flushed to the client".
 */
import type { StateDelta } from "@/lib/turnEngine/types";
import { nonNarrativeTurnGuardDmJson } from "@/lib/security/policy";
import type {
  NarrativeSafetyIssue,
  NarrativeSafetyIssueCode,
  NarrativeSafetyReport,
} from "@/lib/turnEngine/narrativeSafety/types";
import {
  planNarrativeSafetyEnforcement,
  type NarrativeSafetyCommitPolicy,
} from "@/lib/turnEngine/narrativeSafety/runtimeConfig";
import type {
  PacingIssueCode,
  PacingValidationReport,
} from "@/lib/turnEngine/pacing";
import type {
  NarrativeValidationIssueCode,
  NarrativeValidationReport,
} from "@/lib/turnEngine/validateNarrative";
import type { FactCommitGateResult } from "@/lib/worldFacts/factCommitGate";

export const COMMIT_STATE_CHANGING_FIELDS = [
  "player_location",
  "npc_location_updates",
  "relationship_updates",
  "awarded_items",
  "awarded_warehouse_items",
  "new_tasks",
  "task_updates",
  "codex_updates",
  "dm_change_set",
] as const;

export const COMMIT_STATE_MIRROR_FIELDS = [
  "task_changes",
  "relation_changes",
  "loot_changes",
  "world_state_changes",
] as const;

type CommitStateChangingField = (typeof COMMIT_STATE_CHANGING_FIELDS)[number];

const UNKNOWN_ENTITY_WRITE_FIELDS = new Set<CommitStateChangingField>([
  "codex_updates",
  "relationship_updates",
  "npc_location_updates",
  "awarded_items",
  "awarded_warehouse_items",
  "new_tasks",
  "task_updates",
  "player_location",
  "dm_change_set",
]);

const UNKNOWN_ENTITY_CODES = new Set<NarrativeSafetyIssueCode>([
  "unknown_entity_surface",
  "unregistered_npc_id",
  "npc_mentions_unknown_npc",
  "speaker_not_present",
  "offscreen_npc_direct_speech",
  "npc_status_forbidden_direct_speech",
]);

const TURN_GUARD_FALLBACK_MESSAGE =
  "本回合触发叙事一致性保护，未写入剧情状态。请换一种方式重试。";

export type TurnCommitFlag =
  | "options_rewrite_applied"
  | "safe_narrative_fallback_applied"
  | "must_degrade_from_delta"
  | "action_illegal"
  | "fact_commit_gate_blocked"
  | "fact_candidates_rejected"
  | "safety_hard_gate_blocked"
  | "pacing_hard_gate_blocked"
  | "structured_updates_stripped"
  | "post_validator_ok"
  | "post_validator_issues";

export type TurnCommitSummary = {
  requestId: string;
  sessionId: string | null;
  turnIndex: number;
  isActionLegal: boolean;
  degraded: boolean;
  optionsRewriteApplied: boolean;
  safeNarrativeFallbackApplied: boolean;
  playerLocation: string | null;
  deltaSummary: {
    consumesTime: boolean;
    timeCost: StateDelta["timeCost"] | null;
    sanityDamage: number;
    hpDelta: number | null;
    originiumDelta: number | null;
    isDeath: boolean;
    npcLocationUpdates: number;
    npcAttitudeUpdates: number;
    taskUpdates: number;
    newTasks: number;
  };
  validatorIssueCounts: Partial<Record<NarrativeValidationIssueCode, number>>;
  safetyIssueCounts: Partial<Record<NarrativeSafetyIssueCode, number>>;
  pacingIssueCounts: Partial<Record<PacingIssueCode, number>>;
  blockedCommitFields: string[];
  fallbackApplied: boolean;
  entityAuditSummary: {
    strippedFields: Partial<Record<string, number>>;
    strippedUnknownEntityCount: number;
    highIssueCount: number;
    mediumIssueCount: number;
  };
  narrativeGovernanceTelemetry: {
    styleIssueCount: number;
    styleDriftCount: number;
    mechanicalExpositionCount: number;
    npcKnowledgeIssueCount: number;
    rootCauseLeakCount: number;
    unsupportedFactCount: number;
    unsupportedRelationshipClaimCount: number;
    factCommitRejectedCount: number;
    narrativeGovernanceFinalSafe: boolean;
  };
  commitFlags: readonly TurnCommitFlag[];
};

export type CommitTurnArgs = {
  requestId: string;
  sessionId: string | null;
  turnIndex: number;
  /** Candidate DM record (already resolved + rendered). Treated as read-only. */
  candidateDmRecord: Record<string, unknown>;
  /** Structured delta for the turn. */
  delta: StateDelta;
  /** Validator report from `validateNarrative`. */
  validatorReport: NarrativeValidationReport;
  /** Optional Narrative Safety Kernel report. Pure metadata + commit gate input. */
  safetyReport?: NarrativeSafetyReport | null;
  /** Optional pacing validator report. Pure metadata + commit gate input. */
  pacingReport?: PacingValidationReport | null;
  /** Runtime safety rollout policy. Defaults to hard mode for backward-compatible enforcement. */
  safetyPolicy?: NarrativeSafetyCommitPolicy | null;
  /** Optional PR-3 fact-source gate result. Pure metadata, no IO. */
  factCommitGateResult?: FactCommitGateResult | null;
};

export type CommitTurnResult = {
  /** DM record with validator overrides applied (new object; not a mutation). */
  committedDmRecord: Record<string, unknown>;
  summary: TurnCommitSummary;
};

function applyNarrativeOverride(
  base: Record<string, unknown>,
  narrativeOverride: string,
  options: { preserveStateFields?: boolean } = {}
): Record<string, unknown> {
  // `narrativeOverride` is a JSON string from the guard shell. We parse it
  // once and merge; if parsing fails, we keep the original record — the outer
  // output moderation stage still protects the client.
  try {
    const parsed = JSON.parse(narrativeOverride) as Record<string, unknown>;
    // Preserve identity-bearing fields from the original envelope so resolvers
    // downstream do not lose session anchors (e.g. turn_mode hints).
    const preservedKeys = options.preserveStateFields === false ? [] : [
      "player_location",
      "npc_location_updates",
      "awarded_items",
      "awarded_warehouse_items",
      "relationship_updates",
      "codex_updates",
      "task_updates",
      "new_tasks",
    ];
    const merged: Record<string, unknown> = { ...parsed };
    for (const key of preservedKeys) {
      if (base[key] !== undefined) merged[key] = base[key];
    }
    return merged;
  } catch {
    return base;
  }
}

function hasHighValidatorIssue(report: NarrativeValidationReport): boolean {
  return report.issues.some((issue) => issue.severity === "high");
}

function countSafetyIssues(
  report: NarrativeSafetyReport | null | undefined
): Partial<Record<NarrativeSafetyIssueCode, number>> {
  if (!report) return {};
  return { ...report.telemetry.byCode };
}

function countPacingIssues(
  report: PacingValidationReport | null | undefined
): Partial<Record<PacingIssueCode, number>> {
  if (!report) return {};
  return { ...report.telemetry.byCode };
}

function isCommitStateChangingField(value: string): value is CommitStateChangingField {
  return (COMMIT_STATE_CHANGING_FIELDS as readonly string[]).includes(value);
}

function parseIssueField(issue: NarrativeSafetyIssue): CommitStateChangingField | null {
  const detail = issue.detail ?? "";
  const match = detail.match(/(?:^|\|)field=([a-zA-Z0-9_]+)/);
  if (match?.[1] && isCommitStateChangingField(match[1])) return match[1];
  if (issue.anchor && isCommitStateChangingField(issue.anchor)) return issue.anchor;
  return null;
}

function addBlockedField(blocked: Set<string>, field: string): void {
  blocked.add(field);
}

function stripField(
  record: Record<string, unknown>,
  field: string,
  blocked: Set<string>,
  strippedFields: Partial<Record<string, number>>
): Record<string, unknown> {
  if (!(field in record)) return record;
  const next = { ...record };
  const value = next[field];
  strippedFields[field] =
    (strippedFields[field] ?? 0) + (Array.isArray(value) ? value.length : value === undefined ? 0 : 1);
  delete next[field];
  addBlockedField(blocked, field);
  return next;
}

function recordContainsAnchor(value: unknown, anchors: readonly string[]): boolean {
  if (anchors.length === 0) return false;
  const text = JSON.stringify(value ?? "");
  return anchors.some((anchor) => anchor && text.includes(anchor));
}

function stripArrayRowsByAnchors(
  record: Record<string, unknown>,
  field: CommitStateChangingField,
  anchors: readonly string[],
  blocked: Set<string>,
  strippedFields: Partial<Record<string, number>>
): Record<string, unknown> {
  if (!(field in record)) return record;
  const value = record[field];
  if (!Array.isArray(value)) {
    if (anchors.length === 0 || recordContainsAnchor(value, anchors)) {
      return stripField(record, field, blocked, strippedFields);
    }
    return record;
  }
  if (anchors.length === 0) return stripField(record, field, blocked, strippedFields);
  const filtered = value.filter((row) => !recordContainsAnchor(row, anchors));
  const removed = value.length - filtered.length;
  if (removed <= 0) return record;
  strippedFields[field] = (strippedFields[field] ?? 0) + removed;
  addBlockedField(blocked, field);
  return { ...record, [field]: filtered };
}

function collectUnknownEntityRepairs(report: NarrativeSafetyReport | null | undefined): Map<CommitStateChangingField, string[]> {
  const fields = new Map<CommitStateChangingField, string[]>();
  for (const issue of report?.issues ?? []) {
    if (issue.severity === "low") continue;
    if (!UNKNOWN_ENTITY_CODES.has(issue.code)) continue;
    const parsedField = parseIssueField(issue);
    const targetFields =
      parsedField && UNKNOWN_ENTITY_WRITE_FIELDS.has(parsedField)
        ? [parsedField]
        : (["codex_updates", "relationship_updates", "npc_location_updates"] as const);
    for (const field of targetFields) {
      const anchors = fields.get(field) ?? [];
      if (issue.anchor) anchors.push(issue.anchor);
      fields.set(field, anchors);
    }
  }
  return fields;
}

function applySafetyCommitGate(args: {
  record: Record<string, unknown>;
  safetyReport?: NarrativeSafetyReport | null;
  hardBlockCommit: boolean;
  allowUnknownEntityRepairs: boolean;
}): {
  record: Record<string, unknown>;
  blockedCommitFields: string[];
  strippedFields: Partial<Record<string, number>>;
  strippedUnknownEntityCount: number;
} {
  const blocked = new Set<string>();
  const strippedFields: Partial<Record<string, number>> = {};
  let record = args.record;

  if (args.hardBlockCommit) {
    for (const field of COMMIT_STATE_CHANGING_FIELDS) {
      record = stripField(record, field, blocked, strippedFields);
    }
    for (const issue of args.safetyReport?.issues ?? []) {
      const issueField = parseIssueField(issue);
      if (issueField) addBlockedField(blocked, issueField);
    }
    for (const field of COMMIT_STATE_MIRROR_FIELDS) {
      record = stripField(record, field, blocked, strippedFields);
    }
    addBlockedField(blocked, "accepted_delta");
    addBlockedField(blocked, "accepted_events");
    addBlockedField(blocked, "time_cost");
    addBlockedField(blocked, "sanity_damage");
    addBlockedField(blocked, "consumes_time");
    addBlockedField(blocked, "currency_change");
    addBlockedField(blocked, "consumed_items");
    return {
      record,
      blockedCommitFields: [...blocked],
      strippedFields,
      strippedUnknownEntityCount: Object.values(strippedFields).reduce((sum, count) => sum + (count ?? 0), 0),
    };
  }

  if (!args.allowUnknownEntityRepairs) {
    return {
      record,
      blockedCommitFields: [],
      strippedFields: {},
      strippedUnknownEntityCount: 0,
    };
  }

  const repairs = collectUnknownEntityRepairs(args.safetyReport);
  for (const [field, anchors] of repairs) {
    record = stripArrayRowsByAnchors(record, field, anchors, blocked, strippedFields);
  }

  return {
    record,
    blockedCommitFields: [...blocked],
    strippedFields,
    strippedUnknownEntityCount: Object.values(strippedFields).reduce((sum, count) => sum + (count ?? 0), 0),
  };
}

function neutralizeAcceptedDeltaFields(
  record: Record<string, unknown>,
  blocked: readonly string[]
): Record<string, unknown> {
  if (!blocked.includes("accepted_delta")) return record;
  const next = {
    ...record,
    sanity_damage: 0,
    consumes_time: false,
    consumed_items: [],
    currency_change: 0,
    main_threat_updates: [],
    weapon_updates: [],
    weapon_bag_updates: [],
    is_death: false,
  };
  delete next.time_cost;
  return next;
}

function arrayCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function boolOrFallback(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function mergeSecurityMeta(
  base: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const prev = (base.security_meta as Record<string, unknown> | undefined) ?? {};
  return { ...base, security_meta: { ...prev, ...patch } };
}

export function commitTurn(args: CommitTurnArgs): CommitTurnResult {
  const { candidateDmRecord, delta, validatorReport } = args;

  let committed: Record<string, unknown> = { ...candidateDmRecord };
  const flags = new Set<TurnCommitFlag>();
  const safetyIssueCounts = countSafetyIssues(args.safetyReport);
  const pacingIssueCounts = countPacingIssues(args.pacingReport);
  const safetyHighIssueCount =
    args.safetyReport?.telemetry.bySeverity.high ??
    args.safetyReport?.issues.filter((issue) => issue.severity === "high").length ??
    0;
  const safetyMediumIssueCount =
    args.safetyReport?.telemetry.bySeverity.medium ??
    args.safetyReport?.issues.filter((issue) => issue.severity === "medium").length ??
    0;
  const safetyEnforcement = planNarrativeSafetyEnforcement({
    safetyReport: args.safetyReport,
    pacingReport: args.pacingReport,
    policy: args.safetyPolicy,
  });
  const hardBlockFromSafety =
    safetyEnforcement.shouldBlockCommit || hasHighValidatorIssue(validatorReport);
  const hardBlockFromPacing = safetyEnforcement.pacingHardGateTriggered;
  const hardBlockCommit =
    hardBlockFromSafety ||
    hardBlockFromPacing ||
    args.factCommitGateResult?.shouldBlockCommit === true;
  if (hardBlockFromSafety) flags.add("safety_hard_gate_blocked");
  if (hardBlockFromPacing) flags.add("pacing_hard_gate_blocked");

  const shouldApplySafetyFallback =
    safetyEnforcement.shouldFallback && safetyEnforcement.mode !== "shadow";
  const effectiveNarrativeOverride =
    validatorReport.narrativeOverride ??
    (hardBlockCommit || shouldApplySafetyFallback
      ? nonNarrativeTurnGuardDmJson(TURN_GUARD_FALLBACK_MESSAGE, {
          requestId: args.requestId,
          reason: "turn_commit_hard_gate",
        })
      : null);

  if (effectiveNarrativeOverride) {
    committed = applyNarrativeOverride(committed, effectiveNarrativeOverride, {
      preserveStateFields: !hardBlockCommit,
    });
    flags.add("safe_narrative_fallback_applied");
  } else if (validatorReport.optionsOverride) {
    committed = { ...committed, options: [...validatorReport.optionsOverride] };
    flags.add("options_rewrite_applied");
  }

  if (delta.mustDegrade) flags.add("must_degrade_from_delta");
  if (delta.isActionLegal === false) flags.add("action_illegal");
  if (args.factCommitGateResult?.shouldBlockCommit) flags.add("fact_commit_gate_blocked");
  if ((args.factCommitGateResult?.rejectedFacts.length ?? 0) > 0) flags.add("fact_candidates_rejected");
  flags.add(validatorReport.ok ? "post_validator_ok" : "post_validator_issues");

  if (args.factCommitGateResult) {
    const audit =
      committed._narrative_audit && typeof committed._narrative_audit === "object" && !Array.isArray(committed._narrative_audit)
        ? (committed._narrative_audit as Record<string, unknown>)
        : {};
    committed = {
      ...committed,
      _narrative_audit: {
        ...audit,
        allowed_fact_ids: args.factCommitGateResult.allowedFacts.map((fact) => fact.factId),
        rejected_fact_ids: args.factCommitGateResult.rejectedFacts
          .map((row) => row.candidate.factId)
          .filter((factId): factId is string => typeof factId === "string" && factId.trim().length > 0),
        fact_commit_blocked: args.factCommitGateResult.shouldBlockCommit,
      },
    };
  }

  const safetyGate = applySafetyCommitGate({
    record: committed,
    safetyReport: args.safetyReport,
    hardBlockCommit,
    allowUnknownEntityRepairs: safetyEnforcement.enabled && safetyEnforcement.mode !== "shadow",
  });
  committed = neutralizeAcceptedDeltaFields(
    safetyGate.record,
    safetyGate.blockedCommitFields
  );
  if (safetyGate.blockedCommitFields.length > 0) flags.add("structured_updates_stripped");

  const factCommitRejectedCount = args.factCommitGateResult?.rejectedFacts.length ?? 0;
  const narrativeGovernanceFinalSafe =
    flags.has("safe_narrative_fallback_applied") ||
    (validatorReport.telemetry.narrativeGovernanceFinalSafe &&
      args.factCommitGateResult?.shouldBlockCommit !== true &&
      !hardBlockFromSafety &&
      !hardBlockFromPacing);
  const narrativeGovernanceTelemetry = {
    styleIssueCount: validatorReport.telemetry.styleIssueCount,
    styleDriftCount: validatorReport.telemetry.styleDriftCount,
    mechanicalExpositionCount: validatorReport.telemetry.mechanicalExpositionCount,
    npcKnowledgeIssueCount: validatorReport.telemetry.npcKnowledgeIssueCount,
    rootCauseLeakCount: validatorReport.telemetry.rootCauseLeakCount,
    unsupportedFactCount: validatorReport.telemetry.unsupportedFactCount,
    unsupportedRelationshipClaimCount: validatorReport.telemetry.unsupportedRelationshipClaimCount,
    factCommitRejectedCount,
    narrativeGovernanceFinalSafe,
  };

  // Attach a compact commit trace to security_meta for debug correlation.
  committed = mergeSecurityMeta(committed, {
    turn_commit: {
      request_id: args.requestId,
      turn_index: args.turnIndex,
      options_rewrite: flags.has("options_rewrite_applied"),
      safe_fallback: flags.has("safe_narrative_fallback_applied"),
      issues: validatorReport.telemetry.totalIssues,
      safety_issue_counts: safetyIssueCounts,
      pacing_issue_counts: pacingIssueCounts,
      safety_policy: {
        mode: safetyEnforcement.mode,
        enabled: safetyEnforcement.enabled,
        decision: safetyEnforcement.decision,
        entity_hard_gate: safetyEnforcement.entityHardGateTriggered,
        pacing_hard_gate: safetyEnforcement.pacingHardGateTriggered,
      },
      blocked_commit_fields: safetyGate.blockedCommitFields,
      fallback_applied: flags.has("safe_narrative_fallback_applied"),
      entity_audit: {
        stripped_fields: safetyGate.strippedFields,
        stripped_unknown_entity_count: safetyGate.strippedUnknownEntityCount,
        high_issue_count: safetyHighIssueCount,
        medium_issue_count: safetyMediumIssueCount,
      },
      fact_gate_blocked: args.factCommitGateResult?.shouldBlockCommit ?? false,
      fact_rejected: factCommitRejectedCount,
      narrative_governance: narrativeGovernanceTelemetry,
    },
  });

  const playerLocation =
    typeof committed.player_location === "string"
      ? committed.player_location
      : hardBlockCommit
        ? null
        : delta.playerLocation ?? null;
  const isFieldBlocked = (field: string): boolean =>
    safetyGate.blockedCommitFields.includes(field);

  const summary: TurnCommitSummary = {
    requestId: args.requestId,
    sessionId: args.sessionId,
    turnIndex: args.turnIndex,
    isActionLegal: delta.isActionLegal !== false,
    degraded:
      flags.has("must_degrade_from_delta") ||
      flags.has("safe_narrative_fallback_applied") ||
      hardBlockCommit,
    optionsRewriteApplied: flags.has("options_rewrite_applied"),
    safeNarrativeFallbackApplied: flags.has("safe_narrative_fallback_applied"),
    playerLocation,
    deltaSummary: {
      consumesTime: boolOrFallback(committed.consumes_time, delta.consumesTime),
      timeCost: hardBlockCommit ? null : delta.timeCost ?? null,
      sanityDamage: numberOrNull(committed.sanity_damage) ?? delta.sanityDamage,
      hpDelta: hardBlockCommit ? null : typeof delta.hpDelta === "number" ? delta.hpDelta : null,
      originiumDelta: hardBlockCommit ? null : typeof delta.originiumDelta === "number" ? delta.originiumDelta : null,
      isDeath: boolOrFallback(committed.is_death, delta.isDeath),
      npcLocationUpdates:
        hardBlockCommit || isFieldBlocked("npc_location_updates")
          ? arrayCount(committed.npc_location_updates)
          : delta.npcLocationUpdates.length,
      npcAttitudeUpdates: delta.npcAttitudeUpdates.length,
      taskUpdates:
        hardBlockCommit || isFieldBlocked("task_updates")
          ? arrayCount(committed.task_updates)
          : delta.taskUpdates.length,
      newTasks:
        hardBlockCommit || isFieldBlocked("new_tasks")
          ? arrayCount(committed.new_tasks)
          : delta.newTasks.length,
    },
    validatorIssueCounts: {
      ...validatorReport.telemetry.byCode,
      ...(args.factCommitGateResult?.shouldBlockCommit
        ? {
            fact_commit_gate_blocked:
              ((validatorReport.telemetry.byCode.fact_commit_gate_blocked ?? 0) + 1),
          }
        : {}),
    },
    safetyIssueCounts,
    pacingIssueCounts,
    blockedCommitFields: safetyGate.blockedCommitFields,
    fallbackApplied: flags.has("safe_narrative_fallback_applied"),
    entityAuditSummary: {
      strippedFields: safetyGate.strippedFields,
      strippedUnknownEntityCount: safetyGate.strippedUnknownEntityCount,
      highIssueCount: safetyHighIssueCount,
      mediumIssueCount: safetyMediumIssueCount,
    },
    narrativeGovernanceTelemetry,
    commitFlags: [...flags],
  };

  return { committedDmRecord: committed, summary };
}
