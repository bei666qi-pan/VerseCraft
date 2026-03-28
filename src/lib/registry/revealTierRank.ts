/** 揭露层级数值（越大越深），与 lore 标签 reveal_fracture 等一致。 */
export const REVEAL_TIER_RANK = {
  surface: 0,
  fracture: 1,
  deep: 2,
  abyss: 3,
} as const;

export type RevealTierRank = (typeof REVEAL_TIER_RANK)[keyof typeof REVEAL_TIER_RANK];

export type RevealTierId = "surface" | "fracture" | "deep" | "abyss";

/** RAG / bootstrap / packet 共用的 reveal_* 标签（与数值档一一对应） */
export type RevealKnowledgeTag = "reveal_surface" | "reveal_fracture" | "reveal_deep" | "reveal_abyss";

export function revealKnowledgeTagFromRank(rank: RevealTierRank): RevealKnowledgeTag {
  if (rank >= REVEAL_TIER_RANK.abyss) return "reveal_abyss";
  if (rank >= REVEAL_TIER_RANK.deep) return "reveal_deep";
  if (rank >= REVEAL_TIER_RANK.fracture) return "reveal_fracture";
  return "reveal_surface";
}

/** Runtime packet 等：数值档 → 分档 id */
export function revealTierIdFromRank(rank: RevealTierRank): RevealTierId {
  if (rank >= REVEAL_TIER_RANK.abyss) return "abyss";
  if (rank >= REVEAL_TIER_RANK.deep) return "deep";
  if (rank >= REVEAL_TIER_RANK.fracture) return "fracture";
  return "surface";
}

/** major_npc revealStages、文案门闸等与数值 rank 对齐 */
export function revealTierRankFromId(tier: RevealTierId): RevealTierRank {
  return REVEAL_TIER_RANK[tier];
}
