export const DEEP_SCENARIO_MATRIX = [
  { capability: "combat", scenarioId: "combat-survival" },
  { capability: "tasks", scenarioId: "quest-lifecycle" },
  { capability: "death_gate", scenarioId: "recovery-death-near-miss" },
  { capability: "foreshadow_lifecycle", scenarioId: "happy-codex-discovery" },
  { capability: "npc_memory", scenarioId: "happy-npc-interaction" },
  { capability: "profession", scenarioId: "profession-progression" },
  { capability: "economy", scenarioId: "happy-trade" },
  { capability: "location_boundary", scenarioId: "boundary-system-test" },
  { capability: "social", scenarioId: "happy-multi-npc-chain" },
  { capability: "multi_world_isolation", scenarioId: "multi-world-isolation" },
] as const;

export const DEEP_SCENARIO_IDS = DEEP_SCENARIO_MATRIX.map((entry) => entry.scenarioId);

export function validateScenarioSelection(args: {
  scenarioIds: string[];
  knownScenarioIds: Iterable<string>;
  requireDeepCoverage: boolean;
}): void {
  const known = new Set(args.knownScenarioIds);
  const duplicates = [...new Set(args.scenarioIds.filter((id, index) => args.scenarioIds.indexOf(id) !== index))];
  const unknown = [...new Set(args.scenarioIds.filter((id) => !known.has(id)))];
  const selected = new Set(args.scenarioIds);
  const missing = args.requireDeepCoverage
    ? DEEP_SCENARIO_MATRIX.filter((entry) => !selected.has(entry.scenarioId))
    : [];
  const errors: string[] = [];
  if (unknown.length > 0) errors.push(`未知场景: ${unknown.join(", ")}`);
  if (duplicates.length > 0) errors.push(`重复场景: ${duplicates.join(", ")}`);
  if (missing.length > 0) errors.push(`缺失必需能力: ${missing.map((entry) => `${entry.capability}(${entry.scenarioId})`).join(", ")}`);
  if (errors.length > 0) throw new Error(`场景矩阵校验失败：${errors.join("；")}`);
}
