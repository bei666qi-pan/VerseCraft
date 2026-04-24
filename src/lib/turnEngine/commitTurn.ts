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
import type {
  NarrativeValidationIssueCode,
  NarrativeValidationReport,
} from "@/lib/turnEngine/validateNarrative";

export type TurnCommitFlag =
  | "options_rewrite_applied"
  | "safe_narrative_fallback_applied"
  | "must_degrade_from_delta"
  | "action_illegal"
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
};

export type CommitTurnResult = {
  /** DM record with validator overrides applied (new object; not a mutation). */
  committedDmRecord: Record<string, unknown>;
  summary: TurnCommitSummary;
};

function applyNarrativeOverride(
  base: Record<string, unknown>,
  narrativeOverride: string
): Record<string, unknown> {
  // `narrativeOverride` is a JSON string from `safeBlockedDmJson`. We parse it
  // once and merge; if parsing fails, we keep the original record — the outer
  // output moderation stage still protects the client.
  try {
    const parsed = JSON.parse(narrativeOverride) as Record<string, unknown>;
    // Preserve identity-bearing fields from the original envelope so resolvers
    // downstream do not lose session anchors (e.g. turn_mode hints).
    const preservedKeys = [
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

  if (validatorReport.narrativeOverride) {
    committed = applyNarrativeOverride(committed, validatorReport.narrativeOverride);
    flags.add("safe_narrative_fallback_applied");
  } else if (validatorReport.optionsOverride) {
    committed = { ...committed, options: [...validatorReport.optionsOverride] };
    flags.add("options_rewrite_applied");
  }

  if (delta.mustDegrade) flags.add("must_degrade_from_delta");
  if (delta.isActionLegal === false) flags.add("action_illegal");
  flags.add(validatorReport.ok ? "post_validator_ok" : "post_validator_issues");

  // Attach a compact commit trace to security_meta for debug correlation.
  committed = mergeSecurityMeta(committed, {
    turn_commit: {
      request_id: args.requestId,
      turn_index: args.turnIndex,
      options_rewrite: flags.has("options_rewrite_applied"),
      safe_fallback: flags.has("safe_narrative_fallback_applied"),
      issues: validatorReport.telemetry.totalIssues,
    },
  });

  const playerLocation =
    typeof committed.player_location === "string"
      ? committed.player_location
      : delta.playerLocation ?? null;

  const summary: TurnCommitSummary = {
    requestId: args.requestId,
    sessionId: args.sessionId,
    turnIndex: args.turnIndex,
    isActionLegal: delta.isActionLegal !== false,
    degraded: flags.has("must_degrade_from_delta") || flags.has("safe_narrative_fallback_applied"),
    optionsRewriteApplied: flags.has("options_rewrite_applied"),
    safeNarrativeFallbackApplied: flags.has("safe_narrative_fallback_applied"),
    playerLocation,
    deltaSummary: {
      consumesTime: delta.consumesTime,
      timeCost: delta.timeCost ?? null,
      sanityDamage: delta.sanityDamage,
      hpDelta: typeof delta.hpDelta === "number" ? delta.hpDelta : null,
      originiumDelta: typeof delta.originiumDelta === "number" ? delta.originiumDelta : null,
      isDeath: delta.isDeath,
      npcLocationUpdates: delta.npcLocationUpdates.length,
      npcAttitudeUpdates: delta.npcAttitudeUpdates.length,
      taskUpdates: delta.taskUpdates.length,
      newTasks: delta.newTasks.length,
    },
    validatorIssueCounts: { ...validatorReport.telemetry.byCode },
    commitFlags: [...flags],
  };

  return { committedDmRecord: committed, summary };
}
