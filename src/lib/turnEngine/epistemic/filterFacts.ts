// src/lib/turnEngine/epistemic/filterFacts.ts
/**
 * Phase-3: classify a pool of `KnowledgeFact`s into the 5 named cognitive
 * buckets (DM-only / scene-public / player-only / actor-scoped / residue).
 *
 * Design principles:
 *
 * - Pure function. No I/O, no store access, no env reads.
 * - Reuses the existing visibility oracle `canActorKnowFact` from
 *   `@/lib/epistemic/guards` 鈥?we do NOT invent a second permission model.
 * - Nominal types are applied *after* classification so downstream code can
 *   rely on the brand guarantees without casting everywhere.
 * - Xinlan (and any future `isXinlanException`) is handled here explicitly:
 *   the privileged actor's own enriched residue remains attached to *that*
 *   actor; it never propagates into other NPCs' buckets.
 * - Reveal tier: facts referenced by `reveal_tier_sensitive_facts` below the
 *   current `maxRevealRank` are downgraded from actor-scoped to "gated" (i.e.
 *   dropped from `actorScopedFacts`, counted in `revealGatedCount`). They
 *   still remain in `dmOnlyFacts` because the DM can author around them.
 */
import {
  canActorKnowFact,
  filterFactsForActor,
} from "@/lib/epistemic/guards";
import {
  DM_ACTOR_ID,
  PLAYER_ACTOR_ID,
  type EpistemicSceneContext,
  type KnowledgeFact,
  type NpcEpistemicProfile,
  type RevealTierSensitiveFactRef,
} from "@/lib/epistemic/types";
import { isXinlanNpcId } from "@/lib/epistemic/policy";
import type {
  ActorScopedFact,
  EmotionalResidueFact,
  EpistemicFilterReason,
  EpistemicFilterResult,
  EpistemicFilterTelemetry,
  PlayerKnownFact,
  ScenePublicFact,
  WorldTruthFact,
} from "./types";

export type FilterFactsArgs = {
  /** All facts known to the engine for this turn (lore + session + runtime). */
  facts: readonly KnowledgeFact[];
  /** Actor we are building the view for. Null = DM-authoring view. */
  actorId: string | null;
  scene: EpistemicSceneContext;
  /** Optional: actor epistemic profile (for Xinlan flag). */
  profile: NpcEpistemicProfile | null;
  /**
   * Current reveal-tier rank for the turn. Facts gated above this rank are
   * dropped from actor-scoped output.
   */
  maxRevealRank: number;
  /** Fact ids gated by reveal-tier, usually from `sessionMemory`. */
  revealTierGatedFacts: readonly RevealTierSensitiveFactRef[];
  /**
   * Emotional residue markers from session memory. The filter threads them
   * through without inventing new claims.
   */
  residueMarkers: ReadonlyArray<{ actorId?: string; note: string }>;
  nowIso?: string;
};

function bumpReason(
  tel: Record<EpistemicFilterReason, number>,
  reason: EpistemicFilterReason
) {
  tel[reason] = (tel[reason] ?? 0) + 1;
}

function emptyRejectedReasonMap(): Record<EpistemicFilterReason, number> {
  return {
    player_private_locked_to_player: 0,
    dm_only_world_truth: 0,
    other_npc_private_memory: 0,
    scope_shared_scene_ok_to_infer: 0,
    scope_public_ok: 0,
    actor_owned_private: 0,
    player_actor_owns_fact: 0,
    reveal_tier_below_threshold: 0,
    xinlan_exception_not_propagated: 0,
    expired_fact_dropped: 0,
  };
}

function brandAs<T extends KnowledgeFact, B extends string>(
  f: T
): T & { readonly __brand: B } {
  return f as T & { readonly __brand: B };
}

function classifyResidue(
  profile: NpcEpistemicProfile | null
): EmotionalResidueFact["mode"] {
  if (!profile?.retainsEmotionalResidue) return "mood_only";
  return profile.isXinlanException &&
    (profile.remembersPlayerIdentity === "exact" ||
      profile.remembersPastLoops)
    ? "mood_plus_identity_anchor"
    : "mood_only";
}

/**
 * Build the 5-bucket filter result for one actor.
 *
 * Contract:
 * - `dmOnlyFacts` always contains `scope === "world" | system_canon`. These
 *   are NEVER returned in the other 4 buckets, regardless of actor.
 * - `playerOnlyFacts` is non-empty ONLY when `actorId === "player"`.
 * - For NPC actors we *do not* propagate Xinlan's enriched memory shell to
 *   other NPC actors' buckets (guarded by `xinlan_exception_not_propagated`
 *   telemetry).
 * - Reveal-tier gated facts are dropped from `actorScopedFacts` and counted
 *   in `revealGatedCount`.
 */
export function filterEpistemicFacts(args: FilterFactsArgs): EpistemicFilterResult {
  const nowIso = args.nowIso ?? new Date().toISOString();
  const actorId = args.actorId && args.actorId.trim() ? args.actorId.trim() : null;
  const isPlayerActor = actorId === PLAYER_ACTOR_ID;
  const isNpcActor = actorId !== null && actorId !== PLAYER_ACTOR_ID && actorId !== DM_ACTOR_ID;

  const gatedIds = new Map<string, number>();
  for (const r of args.revealTierGatedFacts ?? []) {
    if (r?.id) gatedIds.set(r.id, r.minRevealRank);
  }

  const rejectedReasons = emptyRejectedReasonMap();
  let revealGatedCount = 0;

  const dmOnly: WorldTruthFact[] = [];
  const scenePublic: ScenePublicFact[] = [];
  const playerOnly: PlayerKnownFact[] = [];
  const actorScoped: ActorScopedFact[] = [];

  // De-duplicate by id; the main route merges lore + session facts, duplicates
  // are expected when the same session summary arrives through multiple paths.
  const uniq = new Map<string, KnowledgeFact>();
  for (const f of args.facts) {
    if (f && typeof f.id === "string" && f.id) uniq.set(f.id, f);
  }

  for (const f of uniq.values()) {
    // 1. Reveal gate: sensitive facts below current rank never leak.
    const minRank = gatedIds.get(f.id);
    if (typeof minRank === "number" && args.maxRevealRank < minRank) {
      revealGatedCount += 1;
      bumpReason(rejectedReasons, "reveal_tier_below_threshold");
      // DM view still keeps the world-shaped version, so the editor can
      // reason about it.
      if (f.scope === "world" || f.sourceType === "system_canon") {
        dmOnly.push(brandAs<typeof f, "world_truth">(f));
      }
      continue;
    }

    // 2. World truth / system canon: DM-only regardless of actor.
    if (f.scope === "world" || f.sourceType === "system_canon") {
      dmOnly.push(brandAs<typeof f, "world_truth">(f));
      bumpReason(rejectedReasons, "dm_only_world_truth");
      continue;
    }

    // 3. Scene public: accessible to anyone present. Classify first so we do
    //    not double-count it in actor buckets below.
    if (f.scope === "public" || f.scope === "shared_scene") {
      // Still respect canActorKnowFact so a non-present actor does not get
      // `shared_scene` facts it was never present for.
      if (actorId === null || canActorKnowFact(f, actorId, args.scene, { nowIso })) {
        scenePublic.push(brandAs<typeof f, "scene_public">(f));
        bumpReason(rejectedReasons, "scope_public_ok");
      } else {
        bumpReason(rejectedReasons, "scope_shared_scene_ok_to_infer");
      }
      continue;
    }

    // 4. Player scope: only the player actor may see these.
    if (f.scope === "player") {
      if (isPlayerActor) {
        playerOnly.push(brandAs<typeof f, "player_known">(f));
        bumpReason(rejectedReasons, "player_actor_owns_fact");
      } else {
        // Hard rail: never expose to any NPC, even Xinlan.
        bumpReason(rejectedReasons, "player_private_locked_to_player");
      }
      continue;
    }

    // 5. NPC-scoped: only that NPC (the owner) may see it.
    if (f.scope === "npc") {
      const owner = typeof f.ownerId === "string" ? f.ownerId.trim() : "";
      if (owner && actorId === owner) {
        actorScoped.push({
          ...brandAs<typeof f, "actor_scoped">(f),
          ownerActorId: owner,
        } as ActorScopedFact);
        bumpReason(rejectedReasons, "actor_owned_private");
      } else if (owner && isXinlanNpcId(owner) && !isXinlanNpcId(actorId ?? "")) {
        // Xinlan-owned private memory must not propagate to other NPCs.
        bumpReason(rejectedReasons, "xinlan_exception_not_propagated");
      } else {
        bumpReason(rejectedReasons, "other_npc_private_memory");
      }
      continue;
    }

    // 6. Inferred / unknown: fall through canActorKnowFact.
    if (actorId && canActorKnowFact(f, actorId, args.scene, { nowIso })) {
      // Inferred facts we expose to the player actor land in playerOnly; for
      // NPC actors they land in scenePublic (they are typically observation
      // chains).
      if (isPlayerActor) {
        playerOnly.push(brandAs<typeof f, "player_known">(f));
      } else if (isNpcActor) {
        scenePublic.push(brandAs<typeof f, "scene_public">(f));
      }
    }
  }

  // Residue: filter markers by actor id. Player actor does not consume NPC
  // residue; DM view gets the full list.
  const residue: EmotionalResidueFact[] = [];
  const residueMode = classifyResidue(args.profile);
  for (const [idx, m] of (args.residueMarkers ?? []).entries()) {
    if (!m || !m.note || !m.note.trim()) continue;
    const ownerActor = (m.actorId && m.actorId.trim()) || null;
    if (actorId === null) {
      residue.push({
        __brand: "emotional_residue",
        id: `residue:${idx}:${ownerActor ?? "__all__"}`,
        actorId: ownerActor ?? "__all__",
        note: m.note.trim(),
        mode: residueMode,
      });
      continue;
    }
    if (!ownerActor || ownerActor === actorId) {
      residue.push({
        __brand: "emotional_residue",
        id: `residue:${idx}:${ownerActor ?? actorId}`,
        actorId: ownerActor ?? actorId,
        note: m.note.trim(),
        mode: residueMode,
      });
    }
  }

  const telemetry: EpistemicFilterTelemetry = {
    totalInputFacts: uniq.size,
    bucketCounts: {
      dmOnly: dmOnly.length,
      scenePublic: scenePublic.length,
      playerOnly: playerOnly.length,
      actorScoped: actorScoped.length,
      residue: residue.length,
    },
    rejectedReasons,
    revealGatedCount,
    actorIsXinlanException: Boolean(args.profile?.isXinlanException),
    actorId,
  };

  return {
    dmOnlyFacts: dmOnly,
    scenePublicFacts: scenePublic,
    playerOnlyFacts: playerOnly,
    actorScopedFacts: actorScoped,
    residueFacts: residue,
    telemetry,
  };
}

/**
 * Narrow helper: build filter result for the player actor. Equivalent to
 * calling `filterEpistemicFacts` with `actorId = PLAYER_ACTOR_ID`, but
 * explicit in intent when the caller wants the "player view".
 */
export function filterEpistemicFactsForPlayer(
  args: Omit<FilterFactsArgs, "actorId">
): EpistemicFilterResult {
  return filterEpistemicFacts({ ...args, actorId: PLAYER_ACTOR_ID });
}

/** Reuse the existing fact filter for compatibility layer consumers. */
export { filterFactsForActor };
