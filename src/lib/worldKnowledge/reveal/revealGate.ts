import type { LoreFact, RetrievalCandidate } from "../types";
import { inferCanonRevealMinRankFromLoreFact, toCanonFactV1 } from "../canon/adapters";
import type { CanonFactV1, EvidenceGateDecision } from "../canon/types";
import { computeMaxRevealRankFromSignals } from "@/lib/registry/revealRegistry";
import { parsePlayerWorldSignals } from "@/lib/registry/playerWorldSignals";
import { REVEAL_TIER_RANK, type RevealTierRank } from "@/lib/registry/revealTierRank";

export { REVEAL_TIER_RANK, type RevealTierRank };

/**
 * Infer the current reveal ceiling only from synced player state/location.
 * Never use the natural-language player question itself as a reveal unlock.
 */
export function inferMaxRevealRank(playerContext: string | null | undefined, playerLocation: string | null): RevealTierRank {
  const signals = parsePlayerWorldSignals(playerContext, playerLocation);
  return computeMaxRevealRankFromSignals(signals);
}

export function getFactRevealMinRank(fact: LoreFact): RevealTierRank {
  return inferCanonRevealMinRankFromLoreFact(fact) as RevealTierRank;
}

export function filterCandidatesByRevealTier(candidates: RetrievalCandidate[], maxRank: RevealTierRank): RetrievalCandidate[] {
  return candidates.filter((c) => getFactRevealMinRank(c.fact) <= maxRank);
}

export interface RevealGateContextV1 {
  maxRank: RevealTierRank;
  actorNpcId?: string | null;
  presentNpcIds?: string[];
  allowDmFacts?: boolean;
}

export interface LoreGateResultV1 {
  candidate: RetrievalCandidate;
  canonFact: CanonFactV1;
  gateDecision: EvidenceGateDecision;
  gateReason: string;
}

export interface LoreGateResultSetV1 {
  included: LoreGateResultV1[];
  blocked: LoreGateResultV1[];
  downgraded: LoreGateResultV1[];
}

function audienceAllows(canon: CanonFactV1, ctx: RevealGateContextV1): boolean {
  const audiences = new Set(canon.audience);
  if (audiences.has("system_only")) return false;
  if (audiences.has("player") || audiences.has("all_npcs") || audiences.has("location")) return true;

  const actor = ctx.actorNpcId?.trim();
  const present = new Set((ctx.presentNpcIds ?? []).map((id) => id.trim()).filter(Boolean));
  if (audiences.has("present_npcs") && (!actor || present.has(actor) || present.size > 0)) return true;
  if (audiences.has("specific_npc")) {
    const allowed = new Set(canon.specificNpcIds ?? []);
    if (actor && allowed.has(actor)) return true;
    for (const id of present) {
      if (allowed.has(id)) return true;
    }
  }
  if (audiences.has("dm")) return Boolean(ctx.allowDmFacts);
  return false;
}

function classifyGate(candidate: RetrievalCandidate, ctx: RevealGateContextV1): LoreGateResultV1 {
  const canonFact = toCanonFactV1(candidate.fact, {
    revealMinRank: getFactRevealMinRank(candidate.fact),
  });
  if (canonFact.revealMinRank > ctx.maxRank) {
    return {
      candidate,
      canonFact,
      gateDecision: "blocked",
      gateReason: `reveal_rank:${canonFact.revealMinRank}>${ctx.maxRank}`,
    };
  }
  if ((canonFact.truthClass === "dm_only" || canonFact.truthClass === "hidden") && !ctx.allowDmFacts) {
    return {
      candidate,
      canonFact,
      gateDecision: "blocked",
      gateReason: `truth_class:${canonFact.truthClass}`,
    };
  }
  if (!audienceAllows(canonFact, ctx)) {
    return {
      candidate,
      canonFact,
      gateDecision: "blocked",
      gateReason: `audience:${canonFact.audience.join(",")}`,
    };
  }
  return {
    candidate,
    canonFact,
    gateDecision: "included",
    gateReason: "included",
  };
}

export function gateCandidatesForLorePacketV1(
  candidates: RetrievalCandidate[],
  ctx: RevealGateContextV1
): LoreGateResultSetV1 {
  const out: LoreGateResultSetV1 = { included: [], blocked: [], downgraded: [] };
  for (const candidate of candidates) {
    const decision = classifyGate(candidate, ctx);
    if (decision.gateDecision === "included") out.included.push(decision);
    else if (decision.gateDecision === "downgraded") out.downgraded.push(decision);
    else out.blocked.push(decision);
  }
  return out;
}

/**
 * Compatibility wrapper. It now returns an empty list when every candidate is
 * blocked, instead of falling back to ungated deep/hidden facts.
 */
export function gateCandidatesForLorePacket(
  candidates: RetrievalCandidate[],
  maxRank: RevealTierRank
): RetrievalCandidate[] {
  return gateCandidatesForLorePacketV1(candidates, { maxRank }).included.map((result) => result.candidate);
}
