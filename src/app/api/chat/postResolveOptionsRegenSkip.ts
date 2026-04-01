export type PostResolveOptionsRegenSkipReason =
  | "options_regen_only"
  | "opening_first_action_constraint"
  | "settlement_freeze"
  | "turn_mode_narrative_only"
  | "turn_mode_system_transition"
  | "not_skipped";

export function getPostResolveOptionsRegenSkipReason(args: {
  clientPurpose: unknown;
  shouldApplyFirstActionConstraint: boolean;
  settlementFreeze: boolean;
  resolved: { turn_mode?: unknown };
}): PostResolveOptionsRegenSkipReason {
  if (args.clientPurpose === "options_regen_only") return "options_regen_only";
  if (Boolean(args.shouldApplyFirstActionConstraint)) return "opening_first_action_constraint";
  if (Boolean(args.settlementFreeze)) return "settlement_freeze";
  if (args.resolved.turn_mode === "narrative_only") return "turn_mode_narrative_only";
  if (args.resolved.turn_mode === "system_transition") return "turn_mode_system_transition";
  return "not_skipped";
}

export function shouldSkipPostResolveOptionsRegen(args: {
  clientPurpose: unknown;
  shouldApplyFirstActionConstraint: boolean;
  settlementFreeze: boolean;
  resolved: { turn_mode?: unknown };
}): boolean {
  return getPostResolveOptionsRegenSkipReason(args) !== "not_skipped";
}

