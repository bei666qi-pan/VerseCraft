/**
 * Unified options regen decision — evaluates all 5 trigger conditions once
 * and produces a single decision so exactly one LLM call is made.
 *
 * Formerly the 5 decision points were scattered across runStreamFinalHooks:
 *   1. Phase 5  – pre-resolve guard-level regen (generateOptionsOnlyFallback)
 *   2. Phase 7  – turn-mode decision_options fix (generateDecisionOptionsOnlyFallback)
 *   3. Phase 6  – quality-gate decision_options regen (generateDecisionOptionsOnlyFallback)
 *   4. Post-resolve – empty-options regen (generateOptionsOnlyFallback + retry)
 *   5. Post-validator – validator-override regen (generateOptionsOnlyFallback)
 *
 * This module replaces the CHECK part of all 5 sites; the non-LLM state
 * mutations (filtering, deduplication, turn-mode clearing) remain in route.ts.
 * The single LLM call is made after all conditions are evaluated, using the
 * decision returned here.
 */

export type OptionsRegenType = "options" | "decision_options";

export interface OptionsRegenDecision {
  shouldRegen: boolean;
  /** Higher = more critical. 5 (validator) > 4 (decision fix) > 3 (pre-resolve) > 2 (post-resolve) > 1 (quality gate) */
  priority: number;
  /** Already clamped by remainingFinalRepairBudgetMs at the call site */
  budgetMs: number;
  /** Which LLM function to call */
  regenType: OptionsRegenType;
  /** Human-readable reason for observability / debug logging */
  reason: string;
}

const NO_REGEN: OptionsRegenDecision = {
  shouldRegen: false,
  priority: 0,
  budgetMs: 0,
  regenType: "options",
  reason: "no_condition_triggered",
};

export interface UnifiedOptionsRegenInput {
  // --- Phase 5 (pre-resolve) ---
  /** Count of filtered narrative-action options before resolveDmTurn */
  preResolveNarrativeOptCount: number;
  /** settlement_guard === "stage2_freeze_on_illegal_or_death" */
  preResolveFreeze: boolean;

  // --- Phase 7 (turn-mode decision fix) ---
  plannedTurnMode: string;
  /** Filtered narrative options count during turn-mode correction */
  turnModeFilteredOptCount: number;
  /** Filtered decision_options count during turn-mode correction */
  turnModeFilteredDecCount: number;

  // --- Phase 6 (quality gate) ---
  enableDecisionOptionQualityGate: boolean;
  /** resolved.turn_mode after resolveDmTurn */
  resolvedTurnMode: string;
  /** Decision options count after deduplication */
  dedupedDecisionOptCount: number;

  // --- Post-resolve ---
  /** shouldSkipPostResolveOptionsRegen reason. "not_skipped" means re-evaluate. */
  postResolveSkipReason: string;
  enableOptionsAutoRegenOnEmpty: boolean;
  /** Resolved options count (raw strings, not filtered) */
  resolvedOptCount: number;

  // --- Post-validator override ---
  /** Did effectiveValidatorReport.optionsOverride fire? */
  validatorOverrideApplied: boolean;
  /** Count of overridden options after validator cleared them */
  validatorOverriddenOptCount: number;

  // --- Common guards ---
  canRunFinalRepair: boolean;
  deferPlayableOptsToSeparateRequest: boolean;
  /** Malformed candidates already consumed their single bounded recovery lane. */
  malformedCandidateFinalized: boolean;

  // --- Pre-computed budgets (already capped via nextFinalRepairBudgetMs) ---
  budgetPreResolveMs: number;
  budgetDecisionFixMs: number;
  budgetQualityGateMs: number;
  budgetPostResolveMs: number;
  budgetValidatorMs: number;
}

/**
 * Evaluate all 5 options-regen trigger conditions and return a unified decision.
 *
 * The function is pure: no side effects, no IO, no LLM calls. It only
 * evaluates conditions and returns the highest-priority trigger, if any.
 *
 * Callers must:
 *   1. Pre-compute budget values with `nextFinalRepairBudgetMs()`.
 *   2. If `shouldRegen` is true, make exactly one LLM call using the
 *      returned `regenType` and `budgetMs`.
 *   3. Apply the result to dmRecord / resolved and re-commit if needed.
 */
export function evaluateUnifiedOptionsRegen(
  input: UnifiedOptionsRegenInput,
): OptionsRegenDecision {
  // Common guard — if either fails, no regen at all.
  if (
    !input.canRunFinalRepair ||
    input.deferPlayableOptsToSeparateRequest ||
    input.malformedCandidateFinalized
  ) {
    return NO_REGEN;
  }

  // --- Evaluate each condition ---
  const triggers: Array<{
    priority: number;
    regenType: OptionsRegenType;
    budgetMs: number;
    reason: string;
  }> = [];

  // 1. Pre-resolve (priority 3)
  if (
    input.preResolveNarrativeOptCount < 2 &&
    !input.preResolveFreeze
  ) {
    triggers.push({
      priority: 3,
      regenType: "options",
      budgetMs: input.budgetPreResolveMs,
      reason: "pre_resolve_few_options",
    });
  }

  // 2. Turn-mode decision fix (priority 4)
  if (
    input.plannedTurnMode === "decision_required" &&
    input.turnModeFilteredOptCount < 2 &&
    input.turnModeFilteredDecCount < 2
  ) {
    triggers.push({
      priority: 4,
      regenType: "decision_options",
      budgetMs: input.budgetDecisionFixMs,
      reason: "decision_required_no_options",
    });
  }

  // 3. Quality gate dedup failure (priority 1)
  if (
    input.enableDecisionOptionQualityGate &&
    input.resolvedTurnMode === "decision_required" &&
    input.dedupedDecisionOptCount < 2
  ) {
    triggers.push({
      priority: 1,
      regenType: "decision_options",
      budgetMs: input.budgetQualityGateMs,
      reason: "quality_gate_dedup_failed",
    });
  }

  // 4. Post-resolve empty options (priority 2)
  if (
    input.postResolveSkipReason === "not_skipped" &&
    input.enableOptionsAutoRegenOnEmpty &&
    input.resolvedOptCount < 2
  ) {
    triggers.push({
      priority: 2,
      regenType: "options",
      budgetMs: input.budgetPostResolveMs,
      reason: "post_resolve_empty_options",
    });
  }

  // 5. Validator override (priority 5) — clears options for safety; MUST regen
  if (
    input.validatorOverrideApplied &&
    input.validatorOverriddenOptCount < 2
  ) {
    triggers.push({
      priority: 5,
      regenType: "options",
      budgetMs: input.budgetValidatorMs,
      reason: "validator_override_cleared_options",
    });
  }

  if (triggers.length === 0) return NO_REGEN;

  // Pick the highest-priority trigger. When priorities tie, the last
  // one in the array wins (validator > decision fix > pre-resolve > post-resolve > quality gate).
  // Since we push in ascending order, a simple reduce is sufficient.
  const winner = triggers.reduce((best, cur) =>
    cur.priority >= best.priority ? cur : best,
  );

  return {
    shouldRegen: true,
    priority: winner.priority,
    budgetMs: winner.budgetMs,
    regenType: winner.regenType,
    reason: winner.reason,
  };
}
