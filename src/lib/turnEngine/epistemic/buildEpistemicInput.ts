// src/lib/turnEngine/epistemic/buildEpistemicInput.ts
/**
 * Phase-3: orchestrator that gathers facts from every supported source and
 * produces a structured `EpistemicFilterResult`.
 *
 * Source buckets (reused from existing infrastructure, not reinvented):
 *
 *  1. World knowledge / lore RAG (`LoreFact[]` from `getRuntimeLore`) →
 *     converted via `loreFactsToKnowledgeFacts` in `@/lib/epistemic`.
 *  2. Session memory (compressed) → `sessionMemoryRowToKnowledgeFacts`.
 *  3. Runtime packets supplied by the caller (already shaped as
 *     `KnowledgeFact[]`; typically empty today, reserved for Phase-4).
 *  4. Actor-scoped memory snapshots (`actor_scoped_memory_snapshots`) →
 *     attached as `actorScopedFacts` wrappers when they target the current
 *     actor id.
 *
 * The main route still runs its legacy prompt-assembly path (which uses
 * `buildActorScopedEpistemicContext`). This module is an *additional*,
 * structurally-typed seam — it does NOT replace that path yet. See
 * `renderNarrative.ts` for how the filter is threaded into turn-compiler
 * phase 8.
 */
import { loreFactsToKnowledgeFacts } from "@/lib/epistemic/loreFactBridge";
import { sessionMemoryRowToKnowledgeFacts } from "@/lib/epistemic/sessionFactBridge";
import { buildNpcEpistemicProfile } from "@/lib/epistemic/builders";
import {
  PLAYER_ACTOR_ID,
  type EpistemicSceneContext,
  type KnowledgeFact,
  type NpcEpistemicProfile,
} from "@/lib/epistemic/types";
import type { SessionMemoryRow } from "@/lib/memoryCompress";
import type { LoreFact } from "@/lib/worldKnowledge/types";
import { mergeLorePacketSlices } from "@/lib/epistemic/loreFactBridge";
import { coerceToEpistemicMemory } from "@/lib/memoryCompress";
import { filterEpistemicFacts } from "./filterFacts";
import type { EpistemicFilterResult } from "./types";

export type LorePacketInput = {
  retrievedFacts: LoreFact[];
  sceneFacts: LoreFact[];
  privateFacts: LoreFact[];
  coreAnchors: LoreFact[];
  relevantEntities: LoreFact[];
};

export type BuildEpistemicInputArgs = {
  /** Lore packet from world-knowledge retrieval. Optional. */
  lorePacket: LorePacketInput | null;
  /** Session memory row (as read from DB). Optional. */
  sessionMemory: SessionMemoryRow | null;
  /**
   * Runtime-produced facts not covered by the two above sources (e.g. from
   * typed delta transforms, control-plane slot extraction). Optional.
   */
  runtimeFacts?: readonly KnowledgeFact[];
  /** Present NPC ids in the current scene. */
  presentNpcIds: readonly string[];
  /** Focus NPC id (the one the player is addressing). Null = ambient scene. */
  focusNpcId: string | null;
  /** Actor id we are filtering for. Usually same as focus when NPC-oriented. */
  actorId: string | null;
  /** Current max reveal-tier rank for this turn. */
  maxRevealRank: number;
  /** Optional pre-built profile; when omitted and actorId is an NPC, we build one. */
  profile?: NpcEpistemicProfile | null;
  /** Cap: maximum lore facts to hand to the filter (defense-in-depth). */
  maxLoreFacts?: number;
  nowIso?: string;
};

const DEFAULT_MAX_LORE_FACTS = 96;

/**
 * Resolve the NPC profile the filter needs. We only build one when the actor
 * is a non-player, non-DM id so the filter can apply Xinlan / high-charisma
 * exceptions.
 */
function resolveProfile(
  actorId: string | null,
  given: NpcEpistemicProfile | null | undefined
): NpcEpistemicProfile | null {
  if (given) return given;
  if (!actorId || actorId === PLAYER_ACTOR_ID) return null;
  return buildNpcEpistemicProfile(actorId);
}

/**
 * Main entry point for Phase-3. Always returns an `EpistemicFilterResult`
 * — even when inputs are empty, so consumers can unconditionally thread the
 * object through the turn compiler.
 */
export function buildEpistemicInput(
  args: BuildEpistemicInputArgs
): EpistemicFilterResult {
  const nowIso = args.nowIso ?? new Date().toISOString();

  const lorePacketSlice = args.lorePacket
    ? mergeLorePacketSlices(args.lorePacket)
    : [];
  const loreFacts = loreFactsToKnowledgeFacts(
    lorePacketSlice.slice(0, Math.max(0, args.maxLoreFacts ?? DEFAULT_MAX_LORE_FACTS)),
    nowIso
  );
  const sessionFacts = sessionMemoryRowToKnowledgeFacts(
    args.sessionMemory ?? null,
    nowIso
  );
  const runtimeFacts = (args.runtimeFacts ?? []).slice();

  const merged: KnowledgeFact[] = [];
  const seen = new Set<string>();
  for (const f of [...loreFacts, ...sessionFacts, ...runtimeFacts]) {
    if (!f || !f.id || seen.has(f.id)) continue;
    seen.add(f.id);
    merged.push(f);
  }

  const ep = coerceToEpistemicMemory(args.sessionMemory ?? null);
  const scene: EpistemicSceneContext = {
    presentNpcIds: [
      ...new Set(
        [
          ...(args.presentNpcIds ?? []),
          args.focusNpcId ?? "",
        ].filter((x) => typeof x === "string" && x.trim())
      ),
    ],
  };

  const profile = resolveProfile(args.actorId, args.profile ?? null);

  return filterEpistemicFacts({
    facts: merged,
    actorId: args.actorId,
    scene,
    profile,
    maxRevealRank: Number.isFinite(args.maxRevealRank) ? args.maxRevealRank : 0,
    revealTierGatedFacts: ep?.reveal_tier_sensitive_facts ?? [],
    residueMarkers: ep?.emotional_residue_markers ?? [],
    nowIso,
  });
}

/**
 * Build a filter result specifically for the DM authoring view. Useful for
 * analytics / protocol guards that want to know *what the model should NOT
 * have revealed*.
 */
export function buildDmOnlyEpistemicInput(
  args: Omit<BuildEpistemicInputArgs, "actorId" | "profile">
): EpistemicFilterResult {
  return buildEpistemicInput({
    ...args,
    actorId: null,
    profile: null,
  });
}

/**
 * Convenience: build filter result for the player actor.
 * Returns the same shape as `buildEpistemicInput` but ensures downstream
 * callers in narrative rendering can rely on `playerOnlyFacts` being
 * populated from `player`-scoped facts.
 */
export function buildPlayerEpistemicInput(
  args: Omit<BuildEpistemicInputArgs, "actorId">
): EpistemicFilterResult {
  return buildEpistemicInput({
    ...args,
    actorId: PLAYER_ACTOR_ID,
  });
}
