export type TurnOptionsPickMeta = {
  source: "decision_options" | "legacy_options" | "none";
};

function coerceOptionToString(x: unknown): string | null {
  if (typeof x === "string") return x.trim() || null;
  if (x && typeof x === "object" && !Array.isArray(x)) {
    const o = x as Record<string, unknown>;
    if (typeof o.label === "string" && o.label.trim()) return o.label.trim();
    if (typeof o.text === "string" && o.text.trim()) return o.text.trim();
  }
  return null;
}

export function pickTurnOptionsFromResolvedDm(parsed: unknown): { options: string[]; meta: TurnOptionsPickMeta } {
  const obj = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
  const decision = obj ? obj["decision_options"] : null;
  const legacy = obj ? obj["options"] : null;
  const asOptionStringArray = (v: unknown): string[] => {
    if (!Array.isArray(v)) return [];
    const out: string[] = [];
    for (const x of v) {
      const s = coerceOptionToString(x);
      if (s) out.push(s);
    }
    return out;
  };

  const decisionOpts = asOptionStringArray(decision);
  if (decisionOpts.length > 0) return { options: decisionOpts, meta: { source: "decision_options" } };
  const legacyOpts = asOptionStringArray(legacy);
  if (legacyOpts.length > 0) return { options: legacyOpts, meta: { source: "legacy_options" } };
  return { options: [], meta: { source: "none" } };
}

