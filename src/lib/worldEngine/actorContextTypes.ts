/** Deterministic NPC context contracts used to build the single Director prompt. */
export interface ActorRelationEdge {
  sourceNpcId?: string;
  targetNpcId: string;
  relationType: string;
  attitude: "friendly" | "neutral" | "hostile" | "suspicious" | "fearful";
  intensity: number;
}

export interface EpistemicFactSummary {
  id: string;
  summary: string;
  revealTier: number;
  category: string;
  sourceId: string;
}
