export type OptionsRegenTurnModeHint = "decision_required" | "narrative_only" | "system_transition" | "unknown";

export type OptionsRegenReason =
  | "client_turn_mode_narrative_only"
  | "client_turn_mode_system_transition"
  | "upstream_generate_failed"
  | "insufficient_options"
  | "ok";

export type OptionsRegenResponse = {
  // Backward-compatible: old clients only read `options`.
  options: string[];
  // Rich fields for new clients.
  ok: boolean;
  reason: OptionsRegenReason;
  turn_mode: OptionsRegenTurnModeHint;
  decision_required: boolean;
  decision_options: string[];
  debug_reason_codes?: string[];
};

export function buildOptionsRegenResponse(args: {
  clientTurnModeHint?: unknown;
  options: unknown;
  // If the generator itself reported success; we still apply length gate.
  generatorOk?: boolean;
  debugReasonCodes?: string[];
}): OptionsRegenResponse {
  const hint =
    args.clientTurnModeHint === "decision_required" ||
    args.clientTurnModeHint === "narrative_only" ||
    args.clientTurnModeHint === "system_transition"
      ? (args.clientTurnModeHint as OptionsRegenTurnModeHint)
      : "unknown";

  // Always allow options generation regardless of turn_mode.
  // Players should always have clickable options available; they can switch to
  // manual input if they prefer. Previously narrative_only / system_transition
  // blocked regen entirely, leaving players with no actionable choices.

  const opts = Array.isArray(args.options)
    ? (args.options as unknown[]).filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((s) => s.trim()).slice(0, 4)
    : [];

  const ok = Boolean((args.generatorOk ?? true) && opts.length >= 2);
  if (!ok) {
    const reason: OptionsRegenReason = (args.generatorOk ?? true) ? "insufficient_options" : "upstream_generate_failed";
    return {
      ok: false,
      reason,
      turn_mode: "decision_required",
      decision_required: true,
      decision_options: [],
      options: [],
      debug_reason_codes: Array.isArray(args.debugReasonCodes) ? args.debugReasonCodes.slice(0, 8) : [],
    };
  }
  return {
    ok: true,
    reason: "ok",
    turn_mode: "decision_required",
    decision_required: true,
    decision_options: opts,
    options: opts, // legacy mirror
    debug_reason_codes: Array.isArray(args.debugReasonCodes) ? args.debugReasonCodes.slice(0, 8) : [],
  };
}

