import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateUnifiedOptionsRegen,
  type UnifiedOptionsRegenInput,
} from "./optionsRegenDecision";

function baseInput(overrides: Partial<UnifiedOptionsRegenInput> = {}): UnifiedOptionsRegenInput {
  return {
    preResolveNarrativeOptCount: 4,
    preResolveFreeze: false,
    plannedTurnMode: "narrative_only",
    turnModeFilteredOptCount: 4,
    turnModeFilteredDecCount: 0,
    enableDecisionOptionQualityGate: true,
    resolvedTurnMode: "narrative_only",
    dedupedDecisionOptCount: 0,
    postResolveSkipReason: "not_skipped",
    enableOptionsAutoRegenOnEmpty: true,
    resolvedOptCount: 4,
    validatorOverrideApplied: false,
    validatorOverriddenOptCount: 4,
    canRunFinalRepair: true,
    deferPlayableOptsToSeparateRequest: false,
    malformedCandidateFinalized: false,
    budgetPreResolveMs: 3_000,
    budgetDecisionFixMs: 3_000,
    budgetQualityGateMs: 1_800,
    budgetPostResolveMs: 3_000,
    budgetValidatorMs: 3_000,
    ...overrides,
  };
}

test("malformed recovery never starts a later unified options model call", () => {
  const decision = evaluateUnifiedOptionsRegen(baseInput({
    malformedCandidateFinalized: true,
    preResolveNarrativeOptCount: 0,
    plannedTurnMode: "decision_required",
    turnModeFilteredOptCount: 0,
    turnModeFilteredDecCount: 0,
    resolvedTurnMode: "decision_required",
    resolvedOptCount: 0,
    validatorOverrideApplied: true,
    validatorOverriddenOptCount: 0,
  }));

  assert.equal(decision.shouldRegen, false);
  assert.equal(decision.budgetMs, 0);
});

test("normal completed candidates still select the highest-priority options repair", () => {
  const decision = evaluateUnifiedOptionsRegen(baseInput({
    preResolveNarrativeOptCount: 0,
    resolvedOptCount: 0,
    validatorOverrideApplied: true,
    validatorOverriddenOptCount: 0,
  }));

  assert.equal(decision.shouldRegen, true);
  assert.equal(decision.reason, "validator_override_cleared_options");
  assert.equal(decision.budgetMs, 3_000);
});
