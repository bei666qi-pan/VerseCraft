// src/lib/turnEngine/renderNarrative.ts
/**
 * Phase-2 / Phase-3: narrative rendering adapter.
 *
 * Structural contract:
 *   renderNarrativeFromDelta({ dmRecord, delta, epistemicFilter? }) -> dmRecord
 *
 * Today's online turn *still* generates narrative via the main model first,
 * then folds structured changes back onto the DM record (see
 * `applyDmChangeSetToDmRecord`, `applyStage2SettlementGuard`, etc.).
 *
 * This module does NOT re-run the main model. Instead, it is the explicit
 * seam where downstream stages (guards, validators, resolveDmTurn) can read
 * the structured delta *and* the classified `EpistemicFilterResult`
 * alongside the raw DM record.
 *
 * Phase-3 additions:
 *   - Accept an optional `epistemicFilter` argument. Narrative rendering code
 *     that flows through this seam MUST NOT read `dmOnlyFacts` directly; it
 *     may only reason over the four non-DM buckets.
 *   - Attach a compact `__epistemic_filter_meta` marker to the DM record so
 *     downstream validators can decide whether to trust existing narrative or
 *     tighten rewrites.
 *
 * TODO (phase-4):
 *   - Let `delta.mustDegrade === true` short-circuit to a pure structural
 *     narrative (no model call), producing a safe envelope in a single path.
 *   - Gate option-regen / decision-quality-gate fallback calls on the same
 *     filter so those re-render cycles cannot reach world-truth content.
 */
import type { StateDelta } from "@/lib/turnEngine/types";
import type { EpistemicFilterResult } from "@/lib/turnEngine/epistemic/types";

export type RenderNarrativeArgs = {
  /** Parsed + normalized DM record from the main model. */
  dmRecord: Record<string, unknown>;
  /** Structured delta; renderer reads but does not mutate it. */
  delta: StateDelta;
  /**
   * Classified cognitive view for the current actor. Optional in the
   * transitional compatibility path; once Phase-4 lands, this becomes
   * required and `delta.mustDegrade` short-circuits are driven from here.
   */
  epistemicFilter?: EpistemicFilterResult | null;
};

export type RenderNarrativeFilterMeta = {
  actor_id: string | null;
  actor_is_xinlan: boolean;
  reveal_gated_count: number;
  bucket_counts: {
    dmOnly: number;
    scenePublic: number;
    playerOnly: number;
    actorScoped: number;
    residue: number;
  };
  total_input_facts: number;
};

export type RenderNarrativeResult = {
  dmRecord: Record<string, unknown>;
  /** Short reason codes for analytics / debug log. */
  notes: string[];
  /**
   * Compact classification counts. Returned as a side-channel so the
   * caller can emit telemetry without the meta ever touching the final
   * envelope sent to the client.
   */
  epistemicFilterMeta: RenderNarrativeFilterMeta | null;
};

/**
 * Align narrative-surface fields with the structured delta. Non-destructive:
 * the renderer only *fills holes* — it never overwrites fields the main model
 * already wrote, to preserve backward compatibility with the current
 * `/api/chat` SSE contract.
 */
export function renderNarrativeFromDelta(args: RenderNarrativeArgs): RenderNarrativeResult {
  const notes: string[] = [];
  const dm = { ...args.dmRecord };
  const delta = args.delta;

  // Must-degrade signal: fill a minimal boolean frame so downstream guards
  // can short-circuit uniformly. Do NOT rewrite narrative here (that is the
  // job of protocolGuard / safeBlockedDmJson in the current pipeline).
  if (delta.mustDegrade) {
    if (typeof dm.is_action_legal !== "boolean") {
      dm.is_action_legal = false;
      notes.push("filled_is_action_legal_false_from_delta");
    }
    if (typeof dm.consumes_time !== "boolean") {
      dm.consumes_time = false;
      notes.push("filled_consumes_time_false_from_delta");
    }
  }

  // Default-fill structural fields the main model omitted so the resolver has
  // a stable input shape. These are intentionally narrow — the main model can
  // still provide richer values; we only fill when absent.
  if (typeof dm.is_action_legal !== "boolean" && delta.isActionLegal !== null) {
    dm.is_action_legal = delta.isActionLegal;
    notes.push("filled_is_action_legal_from_delta");
  }
  if (typeof dm.consumes_time !== "boolean") {
    dm.consumes_time = delta.consumesTime;
    notes.push("filled_consumes_time_from_delta");
  }
  if (typeof dm.sanity_damage !== "number") {
    dm.sanity_damage = delta.sanityDamage;
    notes.push("filled_sanity_damage_from_delta");
  }
  if (typeof dm.is_death !== "boolean") {
    dm.is_death = delta.isDeath;
    notes.push("filled_is_death_from_delta");
  }
  if (delta.timeCost && typeof dm.time_cost !== "string") {
    dm.time_cost = delta.timeCost;
    notes.push("filled_time_cost_from_delta");
  }
  if (delta.playerLocation && typeof dm.player_location !== "string") {
    dm.player_location = delta.playerLocation;
    notes.push("filled_player_location_from_delta");
  }
  if (typeof delta.originiumDelta === "number" && typeof dm.currency_change !== "number") {
    dm.currency_change = delta.originiumDelta;
    notes.push("filled_currency_change_from_delta");
  }

  // Phase-3: classification meta is returned as a SIDE CHANNEL, not attached
  // to the DM record. Mutating the DM record here would leak the meta into
  // the final `__VERSECRAFT_FINAL__` envelope that the client receives.
  let epistemicFilterMeta: RenderNarrativeFilterMeta | null = null;
  if (args.epistemicFilter) {
    const t = args.epistemicFilter.telemetry;
    epistemicFilterMeta = {
      actor_id: t.actorId,
      actor_is_xinlan: t.actorIsXinlanException,
      reveal_gated_count: t.revealGatedCount,
      bucket_counts: { ...t.bucketCounts },
      total_input_facts: t.totalInputFacts,
    };
    notes.push("captured_epistemic_filter_meta");
  }

  return { dmRecord: dm, notes, epistemicFilterMeta };
}
