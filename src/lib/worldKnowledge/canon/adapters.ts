import type { LoreFact, RetrievalCandidate } from "@/lib/worldKnowledge/types";
import type {
  CanonAudience,
  CanonEvidenceRefV1,
  CanonFactV1,
  CanonTruthClass,
  EvidenceGateDecision,
  LoreEvidenceBundleEntryV1,
} from "./types";

function lowerTags(fact: LoreFact): string[] {
  return (fact.tags ?? []).map((tag) => tag.toLowerCase());
}

export function inferCanonRevealMinRankFromLoreFact(fact: LoreFact): number {
  const tags = lowerTags(fact);
  if (tags.includes("reveal_abyss")) return 3;
  if (tags.includes("reveal_deep")) return 2;
  if (tags.includes("reveal_fracture")) return 1;
  if (tags.includes("reveal_surface")) return 0;

  const key = fact.identity.factKey.toLowerCase();
  if (key.includes("core:apartment_system_canon")) return 1;
  if (key.includes("floor:digestion_axis:")) return 1;
  if (key.includes("truth:apartment_system")) return 1;
  if (key.includes("location:floor_axis:")) return 1;
  return 0;
}

function revealTierFromRank(rank: number): CanonFactV1["revealTier"] {
  if (rank >= 3) return "epilogue";
  if (rank >= 2) return "deep";
  if (rank >= 1) return "fracture";
  return "surface";
}

export function inferCanonTruthClassFromLoreFact(fact: LoreFact): CanonTruthClass {
  const tags = lowerTags(fact);
  const key = fact.identity.factKey.toLowerCase();
  if (tags.includes("dm_only") || tags.includes("dm-only") || key.includes("dm_only")) return "dm_only";
  if (tags.includes("hidden") || tags.includes("secret") || tags.includes("reveal_deep") || tags.includes("reveal_abyss")) {
    return "hidden";
  }
  if (fact.layer === "user_private_lore") return "player_known";
  if (tags.includes("rumor") || fact.factType === "rule") return "rumor";
  if (fact.layer === "core_canon" || fact.layer === "shared_public_lore") return "verified";
  return "observable";
}

function sourceTypeFromLoreFact(fact: LoreFact): CanonEvidenceRefV1["sourceType"] {
  if (fact.source.kind === "registry" || fact.source.kind === "bootstrap") return "registry";
  if (fact.source.kind === "db") return "retrieved_lore";
  if (fact.source.kind === "session") return "memory";
  if (fact.source.kind === "user") return "doc";
  return "unknown";
}

function extractIds(value: string, prefix: string): string[] {
  const re = new RegExp(`${prefix}-\\d{3}`, "gi");
  return [...new Set(value.match(re) ?? [])];
}

function extractNpcIds(fact: LoreFact): string[] {
  const blob = [
    fact.identity.factKey,
    fact.source.entityId ?? "",
    ...(fact.tags ?? []),
  ].join(" ");
  return extractIds(blob, "N");
}

function extractLocationIds(fact: LoreFact): string[] {
  const tags = fact.tags ?? [];
  return tags.filter((tag) => /^B[12]$|^[1-7]F_|^[1-7]$/.test(tag) || tag.includes("_")).slice(0, 8);
}

export function inferCanonAudienceFromLoreFact(fact: LoreFact): CanonAudience[] {
  const truthClass = inferCanonTruthClassFromLoreFact(fact);
  if (truthClass === "dm_only") return ["dm", "system_only"];
  if (truthClass === "hidden") return ["dm"];
  if (fact.layer === "user_private_lore") return ["player", "dm"];
  if (fact.factType === "npc" || fact.factType === "relationship") return ["player", "present_npcs"];
  if (fact.factType === "location") return ["player", "present_npcs", "location"];
  return ["player", "dm", "all_npcs"];
}

export function toCanonFactV1(
  fact: LoreFact,
  opts: {
    revealMinRank?: number;
    evidenceId?: string;
    sourcePath?: string;
    confidence?: number;
  } = {}
): CanonFactV1 {
  const sourceType = sourceTypeFromLoreFact(fact);
  const revealMinRank = opts.revealMinRank ?? inferCanonRevealMinRankFromLoreFact(fact);
  const specificNpcIds = extractNpcIds(fact);
  const locationIds = extractLocationIds(fact);
  const evidenceId = opts.evidenceId ?? `${fact.identity.factKey}:evidence`;
  return {
    factId: fact.identity.factKey,
    canonicalText: fact.canonicalText,
    truthClass: inferCanonTruthClassFromLoreFact(fact),
    audience: inferCanonAudienceFromLoreFact(fact),
    ...(specificNpcIds.length > 0 ? { specificNpcIds } : {}),
    ...(locationIds.length > 0 ? { locationIds } : {}),
    revealMinRank,
    revealTier: revealTierFromRank(revealMinRank),
    evidenceRefs: [
      {
        id: evidenceId,
        sourceType,
        sourcePath: opts.sourcePath ?? (fact.source.kind === "registry" ? `registry:${fact.source.entityId ?? "core"}` : undefined),
        sourceId: fact.source.entityId ?? fact.normalizedHash ?? fact.identity.factKey,
        quote: fact.canonicalText.replace(/\s+/g, " ").slice(0, 240),
        confidence: opts.confidence ?? 0.8,
      },
    ],
    sourceType,
    tags: fact.tags,
    confidence: opts.confidence ?? 0.8,
  };
}

export function toLoreEvidenceBundleEntry(
  candidate: RetrievalCandidate,
  gateDecision: EvidenceGateDecision,
  gateReason: string
): LoreEvidenceBundleEntryV1 {
  const canon = toCanonFactV1(candidate.fact);
  return {
    factId: canon.factId,
    canonicalText: canon.canonicalText,
    truthClass: canon.truthClass,
    audience: canon.audience,
    specificNpcIds: canon.specificNpcIds,
    factionIds: canon.factionIds,
    locationIds: canon.locationIds,
    revealMinRank: canon.revealMinRank,
    revealTier: canon.revealTier,
    evidenceRefs: canon.evidenceRefs,
    sourceType: canon.sourceType,
    tags: canon.tags,
    confidence: canon.confidence,
    retrievalScore: candidate.score,
    rerankScore: candidate.score,
    gateDecision,
    gateReason,
  };
}
