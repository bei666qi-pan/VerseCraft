export type TurnOptionsPickMeta = {
  source: "decision_options" | "legacy_options" | "none";
};

export function pickTurnOptionsFromResolvedDm(parsed: unknown): { options: string[]; meta: TurnOptionsPickMeta } {
  const obj = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
  const decision = obj ? obj["decision_options"] : null;
  const legacy = obj ? obj["options"] : null;
  const asStringArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((s) => s.trim()) : [];

  const decisionOpts = asStringArray(decision);
  if (decisionOpts.length > 0) return { options: decisionOpts, meta: { source: "decision_options" } };
  const legacyOpts = asStringArray(legacy);
  if (legacyOpts.length > 0) return { options: legacyOpts, meta: { source: "legacy_options" } };
  return { options: [], meta: { source: "none" } };
}

