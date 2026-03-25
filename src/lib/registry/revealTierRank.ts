/** 揭露层级数值（越大越深），与 lore 标签 reveal_fracture 等一致。 */
export const REVEAL_TIER_RANK = {
  surface: 0,
  fracture: 1,
  deep: 2,
  abyss: 3,
} as const;

export type RevealTierRank = (typeof REVEAL_TIER_RANK)[keyof typeof REVEAL_TIER_RANK];

export type RevealTierId = "surface" | "fracture" | "deep" | "abyss";
