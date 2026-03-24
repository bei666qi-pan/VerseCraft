export function createDefaultAnchorUnlocks(): Record<"B1" | "1" | "7", boolean> {
  return { B1: true, "1": false, "7": false };
}

export function normalizeAnchorUnlocks(
  input: unknown
): Record<"B1" | "1" | "7", boolean> {
  const base = createDefaultAnchorUnlocks();
  if (!input || typeof input !== "object" || Array.isArray(input)) return base;
  const raw = input as Record<string, unknown>;
  return {
    B1: typeof raw.B1 === "boolean" ? raw.B1 : base.B1,
    "1": typeof raw["1"] === "boolean" ? raw["1"] : base["1"],
    "7": typeof raw["7"] === "boolean" ? raw["7"] : base["7"],
  };
}
