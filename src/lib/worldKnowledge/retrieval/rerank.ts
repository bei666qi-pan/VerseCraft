import type { RetrievalCandidate } from "../types";

export interface RerankContext {
  playerLocation: string | null;
  recentlyEncounteredEntities: string[];
}

function scoreBoost(candidate: RetrievalCandidate, ctx: RerankContext): number {
  let boost = 0;
  const key = candidate.fact.identity.factKey.toLowerCase();
  const text = candidate.fact.canonicalText.toLowerCase();

  if (ctx.playerLocation && (key.includes(ctx.playerLocation.toLowerCase()) || text.includes(ctx.playerLocation.toLowerCase()))) {
    boost += 50;
  }
  for (const eid of ctx.recentlyEncounteredEntities) {
    const e = eid.toLowerCase();
    if (key.includes(e) || text.includes(e)) boost += 30;
  }
  if (candidate.fact.layer === "user_private_lore") boost += 25;
  if (candidate.fact.factType === "rule" || candidate.fact.factType === "world_mechanism") boost += 18;
  if (candidate.fact.isHot) boost += 10;
  return boost;
}

export function rerankCandidates(candidates: RetrievalCandidate[], ctx: RerankContext): RetrievalCandidate[] {
  return [...candidates]
    .map((c) => ({ ...c, score: c.score + scoreBoost(c, ctx) }))
    .sort((a, b) => b.score - a.score);
}

