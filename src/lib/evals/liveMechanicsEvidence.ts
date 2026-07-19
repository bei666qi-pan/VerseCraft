export const LIVE_MECHANIC_SCENARIOS = [
  "weapon-lifecycle",
  "profession-progression",
  "quest-lifecycle",
  "quest-delivery-missing-item",
  "combat-survival",
  "recovery-weapon-repair",
] as const;

export type LiveMechanicScenarioId = (typeof LIVE_MECHANIC_SCENARIOS)[number];

type MechanicFinalState = {
  equippedWeapon: string | null;
  weaponStability: number;
  activeTaskIds: string[];
  completedTaskIds: string[];
  inventoryItemIds: string[];
  latestDmJson?: Record<string, unknown>;
};

export type LiveMechanicRunEvidence = {
  runId: string;
  finalState: MechanicFinalState;
};

function scenarioFromRunId(runId: string): LiveMechanicScenarioId | null {
  return LIVE_MECHANIC_SCENARIOS.find((scenario) => runId === scenario || runId.startsWith(`${scenario}-`)) ?? null;
}

function hasTaskUpdate(dmJson: Record<string, unknown> | undefined, taskId: string, status: string): boolean {
  if (!Array.isArray(dmJson?.task_updates)) return false;
  return dmJson.task_updates.some((row) =>
    !!row &&
    typeof row === "object" &&
    !Array.isArray(row) &&
    ((row as Record<string, unknown>).id === taskId || (row as Record<string, unknown>).task_id === taskId) &&
    (row as Record<string, unknown>).status === status
  );
}

function hasOnlyNoItems(dmJson: Record<string, unknown> | undefined, field: "consumed_items" | "awarded_items"): boolean {
  return Array.isArray(dmJson?.[field]) && dmJson[field].length === 0;
}

function hasExpectedSettlement(scenario: LiveMechanicScenarioId, state: MechanicFinalState): boolean {
  switch (scenario) {
    case "weapon-lifecycle":
      return state.equippedWeapon === "WPN-3F-IRON-PIPE" && state.weaponStability < 72;
    case "profession-progression":
      return state.completedTaskIds.includes("prof_trial_lampkeeper");
    case "quest-lifecycle":
      return state.completedTaskIds.includes("t_delivery_letter_b1") &&
        !state.inventoryItemIds.includes("I-B08") &&
        hasTaskUpdate(state.latestDmJson, "t_delivery_letter_b1", "completed") &&
        Array.isArray(state.latestDmJson?.consumed_items) &&
        state.latestDmJson.consumed_items.includes("I-B08");
    case "quest-delivery-missing-item":
      return state.activeTaskIds.includes("t_delivery_letter_b1") &&
        !state.completedTaskIds.includes("t_delivery_letter_b1") &&
        !state.inventoryItemIds.includes("I-B08") &&
        hasOnlyNoItems(state.latestDmJson, "consumed_items") &&
        hasOnlyNoItems(state.latestDmJson, "awarded_items") &&
        state.latestDmJson?.consumes_time === false &&
        /不能凭空取出信件/u.test(String(state.latestDmJson?.narrative ?? ""));
    case "combat-survival":
      return state.weaponStability < 72;
    case "recovery-weapon-repair":
      return state.weaponStability > 5;
  }
}

/**
 * Builds non-vacuous evidence for every real campaign run. The orchestrator's
 * transcript does not retain scenarioId, so infer it only from the canonical
 * run-id prefix and fail closed for unknown or missing scenario coverage.
 */
export function buildLiveMechanicsChecks(runs: readonly LiveMechanicRunEvidence[]) {
  const checksByRun: Record<string, boolean> = {};
  const runsByScenario = new Map<LiveMechanicScenarioId, number>();
  const passedByScenario = new Map<LiveMechanicScenarioId, boolean>();

  for (const run of runs) {
    const scenario = scenarioFromRunId(run.runId);
    if (!scenario) throw new Error(`Unable to derive mechanics scenario from run id: ${run.runId}`);
    const passed = hasExpectedSettlement(scenario, run.finalState);
    checksByRun[run.runId] = passed;
    runsByScenario.set(scenario, (runsByScenario.get(scenario) ?? 0) + 1);
    passedByScenario.set(scenario, (passedByScenario.get(scenario) ?? true) && passed);
  }

  const mechanics = Object.fromEntries(LIVE_MECHANIC_SCENARIOS.map((scenario) => {
    if ((runsByScenario.get(scenario) ?? 0) === 0) {
      throw new Error(`No real campaign run was recorded for mechanics scenario: ${scenario}`);
    }
    return [scenario, passedByScenario.get(scenario) === true];
  })) as Record<LiveMechanicScenarioId, boolean>;

  return { checksByRun, mechanics };
}
