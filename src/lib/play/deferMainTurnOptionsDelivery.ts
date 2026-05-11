import type { ResolvedDmTurn } from "@/features/play/turnCommit/resolveDmTurn";

/**
 * True when FINAL payload sent to browser should omit playable options/decision_options
 * (client triggers options_regen_only after narrative settles).
 *
 * Mirrors item injection skip cues: illegal action, death, settlement freeze,
 * finale envelope, canned ending options.
 */
export function shouldDeferStripPlayableOptionsForClient(args: {
  clientPurpose: unknown;
  isActionLegal: boolean;
  dmLike: Record<string, unknown>;
}): boolean {
  if (args.clientPurpose === "options_regen_only") return false;
  if (!args.isActionLegal) return false;
  const rec = args.dmLike;
  if (rec.is_death === true) return false;
  const m = rec.security_meta;
  if (m && typeof m === "object" && !Array.isArray(m)) {
    const guard = String((m as Record<string, unknown>).settlement_guard ?? "");
    if (guard === "stage2_freeze_on_illegal_or_death") return false;
  }
  const ef = rec.ending_finale;
  if (ef && typeof ef === "object" && !Array.isArray(ef)) return false;

  const opts = Array.isArray(rec.options) ? (rec.options as unknown[]) : [];
  const texts = opts
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((s) => s.length > 0);
  if (texts.some((t) => t.includes("查看结算"))) return false;
  if (texts.length === 1 && texts[0] === "迎接终焉") return false;

  return true;
}

export function shouldApplyDeferredOptionsStrip(
  deferMainTurnOptionsToClient: boolean,
  clientPurpose: unknown,
  dmLike: Record<string, unknown>
): boolean {
  if (!deferMainTurnOptionsToClient) return false;
  const legal = dmLike.is_action_legal === true;
  return shouldDeferStripPlayableOptionsForClient({
    clientPurpose,
    isActionLegal: legal,
    dmLike,
  });
}

/**
 * Clear playable options before SSE FINAL; converge decision envelope to narrative_only-compatible.
 */
export function stripPlayableOptionsForDeferredClientDelivery(resolved: ResolvedDmTurn): ResolvedDmTurn {
  const rec = { ...(resolved as unknown as Record<string, unknown>) };
  rec.options = [];
  rec.decision_options = [];

  const tm = typeof rec.turn_mode === "string" ? rec.turn_mode.trim() : "";
  if (tm === "decision_required" || rec.decision_required === true) {
    rec.turn_mode = "narrative_only";
    rec.decision_required = false;
    if (!(typeof rec.auto_continue_hint === "string" && rec.auto_continue_hint.trim())) {
      rec.auto_continue_hint = "（继续）";
    }
  }

  return rec as unknown as ResolvedDmTurn;
}
