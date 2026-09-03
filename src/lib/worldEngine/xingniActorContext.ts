import type { NpcAgentState } from "@/lib/socialWorld/types";
import { QINGSHI_NPCS } from "@/lib/worlds/xingni/qingshiContent";
import { QINGSHI_NPC_PROFILES } from "@/lib/worlds/xingni/qingshiProductionContent";
import type { ActorScopedContext } from "./actorContextProjector";

export function buildXingniActorContext(args: {
  presentNpcIds: readonly string[];
  deadNpcIds: readonly string[];
  turnIndex: number;
}): Pick<ActorScopedContext, "npcStates" | "sceneNpcIds" | "playerMentionedNpcIds" | "worldFacts" | "relationEdges" | "epistemicIndex"> {
  const dead = new Set(args.deadNpcIds);
  const registered = new Set(QINGSHI_NPCS.map((npc) => npc.id));
  const sceneNpcIds = args.presentNpcIds.filter((id) => registered.has(id) && !dead.has(id)).slice(0, 32);
  const npcStates: NpcAgentState[] = QINGSHI_NPCS.filter((npc) => !dead.has(npc.id)).map((npc) => {
    const profile = QINGSHI_NPC_PROFILES[npc.id as keyof typeof QINGSHI_NPC_PROFILES];
    return {
      npcId: npc.id,
      status: sceneNpcIds.includes(npc.id) ? "active" : "offscreen",
      currentGoal: profile.goal,
      currentFear: null,
      currentNeed: null,
      agenda: [],
      knownFactIds: profile.facts.filter((fact) => fact.tier !== "sealed").map((fact) => fact.id),
      suspectedFactIds: [],
      forbiddenRevealIds: profile.facts.filter((fact) => fact.tier === "sealed").map((fact) => fact.id),
      socialEnergy: 0.5,
      volatility: 0.2,
      agencyWeight: 0.5,
      plotRelevance: sceneNpcIds.includes(npc.id) ? 1 : 0.4,
      lastActiveTurn: args.turnIndex,
      nextEligibleTurn: args.turnIndex,
    };
  });
  const worldFacts = Object.entries(QINGSHI_NPC_PROFILES).flatMap(([npcId, profile]) =>
    profile.facts.map((fact) => ({
      id: fact.id,
      summary: fact.text,
      revealTier: fact.tier === "public" ? 0 : fact.tier === "trusted" ? 1 : fact.tier === "quest" ? 2 : 3,
      category: fact.tier === "public" && sceneNpcIds.includes(npcId) ? "scene_public" : "actor_scoped",
      sourceId: npcId,
    })),
  );
  const knownFactIdsByNpc = new Map<string, Set<string>>();
  const suspectedFactIdsByNpc = new Map<string, Set<string>>();
  const forbiddenFactIds = new Set<string>();
  for (const state of npcStates) {
    knownFactIdsByNpc.set(state.npcId, new Set(state.knownFactIds));
    suspectedFactIdsByNpc.set(state.npcId, new Set(state.suspectedFactIds));
    for (const id of state.forbiddenRevealIds) forbiddenFactIds.add(id);
  }
  return {
    npcStates,
    sceneNpcIds,
    playerMentionedNpcIds: [],
    worldFacts,
    relationEdges: [],
    epistemicIndex: { knownFactIdsByNpc, suspectedFactIdsByNpc, forbiddenFactIds },
  };
}
