import { NPCS } from "@/lib/registry/npcs";
import { createEmptyNpcAgentState } from "@/lib/socialWorld/state";
import type { NpcAgentState, NpcRelationEdge } from "@/lib/socialWorld/types";
import type { ActorRelationEdge, EpistemicFactSummary } from "./actorContextTypes";
import type { ActorScopedContext } from "./actorContextProjector";

type DarkMoonActorContext = Pick<
  ActorScopedContext,
  | "npcStates"
  | "sceneNpcIds"
  | "playerMentionedNpcIds"
  | "worldFacts"
  | "relationEdges"
  | "relationEdgesByNpc"
  | "epistemicIndex"
>;

const NPC_BY_ID = new Map(NPCS.map((npc) => [npc.id, npc]));

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function relationAttitude(edge: NpcRelationEdge): ActorRelationEdge["attitude"] {
  if (edge.fear >= 0.6) return "fearful";
  if (edge.suspicion >= 0.6) return "suspicious";
  if (edge.resentment >= 0.6 || edge.trust <= 0.25) return "hostile";
  if (edge.trust >= 0.65) return "friendly";
  return "neutral";
}

function actorRelation(edge: NpcRelationEdge): ActorRelationEdge {
  return {
    sourceNpcId: edge.fromNpcId,
    targetNpcId: edge.toNpcId,
    relationType: edge.publicLabel || "social",
    attitude: relationAttitude(edge),
    intensity: Math.max(
      clamp01(edge.trust),
      clamp01(edge.fear),
      clamp01(edge.debt),
      clamp01(edge.resentment),
      clamp01(edge.suspicion),
    ),
  };
}

function registryFacts(npcId: string): EpistemicFactSummary[] {
  const npc = NPC_BY_ID.get(npcId);
  if (!npc) return [];
  return [
    {
      id: `dm:npc:${npc.id}:lore`,
      summary: npc.lore.slice(0, 500),
      revealTier: 2,
      category: "actor_scoped",
      sourceId: `registry:npc:${npc.id}`,
    },
    {
      id: `dm:npc:${npc.id}:taboo`,
      summary: npc.taboo.slice(0, 320),
      revealTier: 1,
      category: "actor_scoped",
      sourceId: `registry:npc:${npc.id}`,
    },
  ];
}

/** Build a Dark Moon-only Actor context without exposing another actor's private facts. */
export function buildDarkMoonActorContext(args: {
  npcStates: readonly NpcAgentState[];
  relationEdges: readonly NpcRelationEdge[];
  presentNpcIds: readonly string[];
  deadNpcIds: readonly string[];
  turnIndex: number;
}): DarkMoonActorContext {
  const dead = new Set(args.deadNpcIds);
  const presentNpcIds = [...new Set(args.presentNpcIds)]
    .filter((id) => NPC_BY_ID.has(id) && !dead.has(id))
    .slice(0, 32);
  const byNpc = new Map(
    args.npcStates
      .filter((state) => NPC_BY_ID.has(state.npcId) && !dead.has(state.npcId))
      .map((state) => [state.npcId, state]),
  );
  for (const npcId of presentNpcIds) {
    if (!byNpc.has(npcId)) {
      byNpc.set(npcId, {
        ...createEmptyNpcAgentState(npcId, args.turnIndex),
        status: "active",
        plotRelevance: 1,
      });
    }
  }
  const npcStates = [...byNpc.values()];
  const worldFacts = npcStates.flatMap((state) => registryFacts(state.npcId));
  const knownFactIdsByNpc = new Map<string, Set<string>>();
  const suspectedFactIdsByNpc = new Map<string, Set<string>>();
  const forbiddenFactIds = new Set<string>();
  for (const state of npcStates) {
    knownFactIdsByNpc.set(state.npcId, new Set([
      ...state.knownFactIds,
      ...registryFacts(state.npcId).map((fact) => fact.id),
    ]));
    suspectedFactIdsByNpc.set(state.npcId, new Set(state.suspectedFactIds));
    for (const factId of state.forbiddenRevealIds) forbiddenFactIds.add(factId);
  }

  const relationEdges = args.relationEdges
    .filter((edge) => byNpc.has(edge.fromNpcId) && byNpc.has(edge.toNpcId))
    .map(actorRelation);
  const relationEdgesByNpc = new Map<string, ActorRelationEdge[]>();
  for (const edge of relationEdges) {
    if (!edge.sourceNpcId) continue;
    const bucket = relationEdgesByNpc.get(edge.sourceNpcId) ?? [];
    bucket.push(edge);
    relationEdgesByNpc.set(edge.sourceNpcId, bucket);
  }

  return {
    npcStates,
    sceneNpcIds: presentNpcIds,
    playerMentionedNpcIds: [],
    worldFacts,
    relationEdges,
    relationEdgesByNpc,
    epistemicIndex: { knownFactIdsByNpc, suspectedFactIdsByNpc, forbiddenFactIds },
  };
}
