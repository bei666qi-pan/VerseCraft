/**
 * 动作时间成本档位（DM 可选 `time_cost`；与 `consumes_time` 组合见 timeBudget）。
 */
export const ACTION_TIME_COST_KINDS = ["free", "light", "standard", "heavy", "dangerous"] as const;
export type ActionTimeCostKind = (typeof ACTION_TIME_COST_KINDS)[number];

export function normalizeActionTimeCostKind(v: unknown): ActionTimeCostKind | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().toLowerCase();
  return (ACTION_TIME_COST_KINDS as readonly string[]).includes(t) ? (t as ActionTimeCostKind) : undefined;
}
