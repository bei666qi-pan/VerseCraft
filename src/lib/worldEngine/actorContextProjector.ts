import type { NpcAgentState, NpcRelationEdge } from "@/lib/socialWorld/types";
import type { WorldId } from "@/lib/worlds/types";
import type { ActorRelationEdge, EpistemicFactSummary } from "./actorContextTypes";

export interface ActorScopedContext {
  npcStates: NpcAgentState[];
  sceneNpcIds: string[];
  playerMentionedNpcIds: string[];
  worldFacts: EpistemicFactSummary[];
  relationEdges: ActorRelationEdge[];
  relationEdgesByNpc?: Map<string, ActorRelationEdge[]>;
  epistemicIndex: {
    knownFactIdsByNpc: Map<string, Set<string>>;
    suspectedFactIdsByNpc: Map<string, Set<string>>;
    forbiddenFactIds: Set<string>;
  };
}

export interface ActorContextProjection {
  actors: Array<{
    npcId: string;
    currentGoal: string | null;
    knownFactIds: string[];
    relationNpcIds: string[];
  }>;
  promptBlock: string;
}

/** A deterministic, subtractive projection. It never invokes an actor model. */
export function projectActorContext(input: {
  worldId: WorldId;
  turnIndex: number;
  presentNpcIds: readonly string[];
  deadNpcIds: readonly string[];
  npcStates: readonly NpcAgentState[];
  relationEdges: readonly NpcRelationEdge[];
}): ActorContextProjection {
  const dead = new Set(input.deadNpcIds);
  const present = new Set(input.presentNpcIds.filter((npcId) => !dead.has(npcId)));
  const actors = input.npcStates
    .filter((state) => present.has(state.npcId) && !dead.has(state.npcId))
    .map((state) => {
      const forbidden = new Set(state.forbiddenRevealIds);
      return {
        npcId: state.npcId,
        currentGoal: state.currentGoal ?? null,
        knownFactIds: [...new Set(state.knownFactIds.filter((factId) => !forbidden.has(factId)))].sort(),
        relationNpcIds: [...new Set(
          input.relationEdges
            .filter((edge) => edge.fromNpcId === state.npcId && !dead.has(edge.toNpcId))
            .map((edge) => edge.toNpcId),
        )].sort(),
      };
    })
    .sort((a, b) => a.npcId.localeCompare(b.npcId));

  return {
    actors,
    promptBlock: JSON.stringify({
      schema: "actor_context_projection_v1",
      worldId: input.worldId,
      turnIndex: input.turnIndex,
      actors,
    }),
  };
}
