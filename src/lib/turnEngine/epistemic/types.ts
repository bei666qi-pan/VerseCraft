// src/lib/turnEngine/epistemic/types.ts
/**
 * Phase-3: structured epistemic filter output for the online turn engine.
 *
 * These are *nominal wrapper* types around the existing `KnowledgeFact`
 * primitive in `@/lib/epistemic/types`. We deliberately do NOT fork the
 * underlying fact shape — the reveal/memory/world-knowledge pipeline keeps
 * producing `KnowledgeFact[]`. What this module adds is a *typed 5-bucket
 * projection* that the narrative renderer and analytics can consume without
 * having to re-run `filterFactsForActor` themselves.
 *
 * Cognitive layers (from most to least secret):
 *   1. World truth   -> only DM editor may see.
 *   2. Scene public  -> anyone present in the scene may observe/infer.
 *   3. Player known  -> only the player-actor has access; never leaks to NPCs.
 *   4. Actor scoped  -> a single NPC's private memory / shell knowledge.
 *   5. Emotional residue -> mood-only / identity-anchor hints, not a truth claim.
 */
import type { KnowledgeFact } from "@/lib/epistemic/types";

/**
 * Strictly DM-only fact. MUST NOT be handed to any narrative renderer that
 * can expose content to player-facing output. Typically `scope === "world"`
 * or `sourceType === "system_canon"`.
 */
export type WorldTruthFact = KnowledgeFact & { readonly __brand: "world_truth" };

/** Fact everyone in the scene may legally observe or repeat. */
export type ScenePublicFact = KnowledgeFact & { readonly __brand: "scene_public" };

/**
 * Fact the *player character* knows but has NOT necessarily told any NPC.
 * NPCs must not use it as their own memory unless gated by reveal tier.
 */
export type PlayerKnownFact = KnowledgeFact & { readonly __brand: "player_known" };

/** Private fact scoped to a single NPC (their shell memory / observations). */
export type ActorScopedFact = KnowledgeFact & {
  readonly __brand: "actor_scoped";
  readonly ownerActorId: string;
};

/**
 * Emotional residue = mood-only "feel" hint tied to an actor. It is NOT a
 * truth claim and must not be used as the basis for verifiable statements.
 */
export type EmotionalResidueFact = {
  readonly __brand: "emotional_residue";
  readonly id: string;
  readonly actorId: string;
  readonly note: string;
  readonly mode: "mood_only" | "mood_plus_identity_anchor";
};

/** Why a fact was parked in a given bucket or excluded entirely. */
export type EpistemicFilterReason =
  | "player_private_locked_to_player"
  | "dm_only_world_truth"
  | "other_npc_private_memory"
  | "scope_shared_scene_ok_to_infer"
  | "scope_public_ok"
  | "actor_owned_private"
  | "player_actor_owns_fact"
  | "reveal_tier_below_threshold"
  | "xinlan_exception_not_propagated"
  | "expired_fact_dropped";

export type EpistemicFilterTelemetry = {
  /** Total input facts considered. */
  totalInputFacts: number;
  /** Fact count that landed in each bucket. */
  bucketCounts: {
    dmOnly: number;
    scenePublic: number;
    playerOnly: number;
    actorScoped: number;
    residue: number;
  };
  /**
   * Facts dropped because the actor is not eligible (e.g. other NPC's private
   * memory). Shaped as reason codes for downstream analytics, never exposing
   * the underlying fact content.
   */
  rejectedReasons: Record<EpistemicFilterReason, number>;
  /**
   * Facts that would have been exposed to the current actor but required a
   * higher reveal-tier rank than the turn's current rank.
   */
  revealGatedCount: number;
  /**
   * Whether the current actor is Xinlan (N-010) or another explicitly
   * privileged exception. Used by downstream NPC consistency validators to
   * tolerate "old-friend language" without flagging it as leak.
   */
  actorIsXinlanException: boolean;
  /** NPC id the filter was built for; null = DM-authoring view. */
  actorId: string | null;
};

/**
 * Final output of the Phase-3 epistemic filter. Narrative rendering MUST NOT
 * read `dmOnlyFacts` directly; it may only reason over the other four buckets.
 *
 * Consumers should treat these arrays as immutable / read-only.
 */
export type EpistemicFilterResult = {
  /** `scope === "world" | system_canon` — DM editor context only. */
  readonly dmOnlyFacts: readonly WorldTruthFact[];
  /** `scope === "public" | "shared_scene"` — ok to weave into narrative. */
  readonly scenePublicFacts: readonly ScenePublicFact[];
  /**
   * `scope === "player"` — if actor is the player, this is the actor's own
   * known set; for any NPC actor this array is empty by construction.
   */
  readonly playerOnlyFacts: readonly PlayerKnownFact[];
  /**
   * `scope === "npc"` scoped to this actor. For the player actor, contains
   * player-private facts that share the player owner id.
   */
  readonly actorScopedFacts: readonly ActorScopedFact[];
  /** Emotional residue hints for the current actor. */
  readonly residueFacts: readonly EmotionalResidueFact[];
  /** Telemetry for analytics / validators. Never contains fact content. */
  readonly telemetry: EpistemicFilterTelemetry;
};
