export type PostResolveOptionsRegenSkipReason =
  | "options_regen_only"
  | "opening_first_action_constraint"
  | "settlement_freeze"
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
  void args.resolved;
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

