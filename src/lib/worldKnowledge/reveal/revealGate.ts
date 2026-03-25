import type { LoreFact, RetrievalCandidate } from "../types";
import { computeMaxRevealRankFromSignals } from "@/lib/registry/revealRegistry";
import { parsePlayerWorldSignals } from "@/lib/registry/playerWorldSignals";
import { REVEAL_TIER_RANK, type RevealTierRank } from "@/lib/registry/revealTierRank";

export { REVEAL_TIER_RANK, type RevealTierRank };

/**
 * 从玩家状态串推断当前允许揭露到的最高层级（仅依据已落盘/同步的世界状态，不用玩家自然语言问题抬层，避免剧透）。
 * 与 `revealRegistry.REVEAL_GATE_RULES` + `playerWorldSignals` 单一事实源对齐。
 */
export function inferMaxRevealRank(playerContext: string | null | undefined, playerLocation: string | null): RevealTierRank {
  const signals = parsePlayerWorldSignals(playerContext, playerLocation);
  return computeMaxRevealRankFromSignals(signals);
}

/** 单条事实的最低揭露层级（不满足则当前回合不得注入）。 */
export function getFactRevealMinRank(fact: LoreFact): RevealTierRank {
  const tags = fact.tags ?? [];
  if (tags.includes("reveal_abyss")) return REVEAL_TIER_RANK.abyss;
  if (tags.includes("reveal_deep")) return REVEAL_TIER_RANK.deep;
  if (tags.includes("reveal_fracture")) return REVEAL_TIER_RANK.fracture;
  if (tags.includes("reveal_surface")) return REVEAL_TIER_RANK.surface;

  const key = fact.identity.factKey.toLowerCase();
  if (key.includes("core:apartment_system_canon")) return REVEAL_TIER_RANK.fracture;
  if (key.includes("floor:digestion_axis:")) return REVEAL_TIER_RANK.fracture;
  if (key.includes("truth:apartment_system")) return REVEAL_TIER_RANK.fracture;
  if (key.includes("location:floor_axis:")) return REVEAL_TIER_RANK.fracture;

  return REVEAL_TIER_RANK.surface;
}

export function filterCandidatesByRevealTier(candidates: RetrievalCandidate[], maxRank: RevealTierRank): RetrievalCandidate[] {
  return candidates.filter((c) => getFactRevealMinRank(c.fact) <= maxRank);
}

/** 过滤后若为空，退回仅表层事实，避免 RAG 完全沉默。 */
export function gateCandidatesForLorePacket(
  candidates: RetrievalCandidate[],
  maxRank: RevealTierRank
): RetrievalCandidate[] {
  const gated = filterCandidatesByRevealTier(candidates, maxRank);
  if (gated.length > 0) return gated;
  const surfaceOnly = filterCandidatesByRevealTier(candidates, REVEAL_TIER_RANK.surface);
  return surfaceOnly.length > 0 ? surfaceOnly : candidates;
}
