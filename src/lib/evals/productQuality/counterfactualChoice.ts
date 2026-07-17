type Json = Record<string, unknown>;

export interface CounterfactualRun {
  scenarioId?: string;
  initialState?: Json;
  steps?: Array<{ playerAction?: unknown; dmJson?: Json; stateSnapshot?: Json; stateAfter?: Json }>;
}

export interface CounterfactualChoiceAssessment {
  sameInitialState: boolean;
  differentActions: boolean;
  differentStructuredOutcomes: boolean;
  meaningfulChoice: boolean;
  branchSignatures: [string, string];
  reasons: string[];
}

const stable = (value: unknown): string => JSON.stringify(value, (_key, item) => {
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  return Object.fromEntries(Object.entries(item as Json).sort(([a], [b]) => a.localeCompare(b)));
});

function initialGameplayProjection(run: CounterfactualRun): Json {
  const state = run.initialState ?? {};
  const keys = ["hp", "maxHp", "sanity", "originium", "profession", "equippedWeapon", "weaponStability", "weaponContamination", "playerLocation", "activeTaskIds", "completedTaskIds", "presentNpcIds", "activeThreatIds", "inventoryItemIds"];
  return Object.fromEntries(keys.map((key) => [key, state[key] ?? null]));
}

function outcomeProjection(run: CounterfactualRun): Json {
  const step = run.steps?.[0] ?? {};
  const dm = step.dmJson ?? {};
  const state = step.stateSnapshot ?? step.stateAfter ?? {};
  return {
    legal: dm.is_action_legal ?? null,
    sanityDamage: dm.sanity_damage ?? null,
    conflict: dm.conflict_outcome ?? null,
    weaponUpdates: dm.weapon_updates ?? [],
    threatUpdates: dm.main_threat_updates ?? [],
    location: dm.player_location ?? null,
    taskUpdates: dm.task_updates ?? [],
    finalState: {
      sanity: state.sanity ?? null,
      weaponStability: state.weaponStability ?? null,
      weaponContamination: state.weaponContamination ?? null,
      playerLocation: state.playerLocation ?? null,
      activeTaskIds: state.activeTaskIds ?? [],
      completedTaskIds: state.completedTaskIds ?? [],
    },
  };
}

export function assessCounterfactualChoice(a: CounterfactualRun, b: CounterfactualRun): CounterfactualChoiceAssessment {
  const sameInitialState = stable(initialGameplayProjection(a)) === stable(initialGameplayProjection(b));
  const differentActions = String(a.steps?.[0]?.playerAction ?? "").trim() !== String(b.steps?.[0]?.playerAction ?? "").trim();
  const branchSignatures: [string, string] = [stable(outcomeProjection(a)), stable(outcomeProjection(b))];
  const differentStructuredOutcomes = branchSignatures[0] !== branchSignatures[1];
  const meaningfulChoice = sameInitialState && differentActions && differentStructuredOutcomes;
  return {
    sameInitialState,
    differentActions,
    differentStructuredOutcomes,
    meaningfulChoice,
    branchSignatures,
    reasons: [
      sameInitialState ? "same_initial_state" : "initial_state_mismatch",
      differentActions ? "actions_differ" : "actions_identical",
      differentStructuredOutcomes ? "structured_outcomes_differ" : "cosmetic_only_outcomes",
    ],
  };
}
