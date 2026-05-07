import type { RevealTierRank } from "@/lib/registry/revealTierRank";
import { REVEAL_TIER_RANK } from "@/lib/registry/revealTierRank";

export type NpcBeliefType = "knows" | "suspects" | "rumor" | "misunderstands" | "denies";

export type NpcBeliefSource =
  | "same_floor"
  | "relationship"
  | "witnessed"
  | "rumor"
  | "role"
  | "deep_secret"
  | "session_committed";

export type ApartmentCauseKnowledgeLevel =
  | "none"
  | "surface"
  | "local_pattern"
  | "cause_fragment"
  | "root_truth";

export type NpcBeliefExpression = "direct" | "hint" | "avoid" | "lie" | "ask_back";

export type NpcBelief = {
  beliefId: string;
  npcId: string;
  factId: string;
  beliefType: NpcBeliefType;
  confidence: 0 | 1 | 2 | 3;
  source: NpcBeliefSource;
  floorIds: string[];
  relatedNpcIds: string[];
  revealTier: RevealTierRank;
  canSayDirectly: boolean;
  preferredExpression: NpcBeliefExpression;
};

export type NpcBeliefProfile = {
  npcId: string;
  floorIds: string[];
  maxApartmentCauseKnowledgeLevel: ApartmentCauseKnowledgeLevel;
  beliefs: NpcBelief[];
};

export const NPC_KNOWLEDGE_FACT_IDS = {
  B1_PUBLIC_ANOMALY: "fact:floor:B1:public_anomaly",
  F1_PUBLIC_ANOMALY: "fact:floor:1F:public_anomaly",
  F7_PUBLIC_ANOMALY: "fact:floor:7F:public_anomaly",
  ELEVATOR_RUMOR: "fact:rumor:elevator_moves_without_call",
  SEVENTH_FLOOR_SAFE_MISREAD: "fact:false:seventh_floor_is_safe",
  APARTMENT_CAUSE_SURFACE: "fact:apartment_cause:surface_pressure",
  APARTMENT_CAUSE_LOCAL_PATTERN: "fact:apartment_cause:local_pattern",
  APARTMENT_CAUSE_FRAGMENT: "fact:apartment_cause:cause_fragment",
  APARTMENT_CAUSE_ROOT_TRUTH: "fact:apartment_cause:root_truth",
  XINLAN_ANCHOR_RESIDUE: "fact:npc:N-010:anchor_residue",
} as const;

const LEVEL_RANK: Record<ApartmentCauseKnowledgeLevel, number> = {
  none: 0,
  surface: 1,
  local_pattern: 2,
  cause_fragment: 3,
  root_truth: 4,
};

function normalizeNpcId(npcId: string | null | undefined): string {
  return String(npcId ?? "").trim();
}

function belief(args: {
  beliefId: string;
  npcId: string;
  factId: string;
  beliefType: NpcBeliefType;
  confidence: 0 | 1 | 2 | 3;
  source: NpcBeliefSource;
  floorIds?: string[];
  relatedNpcIds?: string[];
  revealTier?: RevealTierRank;
  canSayDirectly?: boolean;
  preferredExpression: NpcBeliefExpression;
}): NpcBelief {
  return {
    beliefId: args.beliefId,
    npcId: args.npcId,
    factId: args.factId,
    beliefType: args.beliefType,
    confidence: args.confidence,
    source: args.source,
    floorIds: args.floorIds ?? [],
    relatedNpcIds: args.relatedNpcIds ?? [],
    revealTier: args.revealTier ?? REVEAL_TIER_RANK.surface,
    canSayDirectly: args.canSayDirectly ?? false,
    preferredExpression: args.preferredExpression,
  };
}

const BELIEF_PROFILES: Record<string, NpcBeliefProfile> = {
  "N-001": {
    npcId: "N-001",
    floorIds: ["B1"],
    maxApartmentCauseKnowledgeLevel: "none",
    beliefs: [
      belief({
        beliefId: "belief:N-001:B1_public_anomaly",
        npcId: "N-001",
        factId: NPC_KNOWLEDGE_FACT_IDS.B1_PUBLIC_ANOMALY,
        beliefType: "knows",
        confidence: 2,
        source: "same_floor",
        floorIds: ["B1"],
        canSayDirectly: true,
        preferredExpression: "direct",
      }),
      belief({
        beliefId: "belief:N-001:elevator_rumor",
        npcId: "N-001",
        factId: NPC_KNOWLEDGE_FACT_IDS.ELEVATOR_RUMOR,
        beliefType: "rumor",
        confidence: 1,
        source: "rumor",
        floorIds: ["B1"],
        canSayDirectly: false,
        preferredExpression: "hint",
      }),
      belief({
        beliefId: "belief:N-001:seventh_floor_safe_misread",
        npcId: "N-001",
        factId: NPC_KNOWLEDGE_FACT_IDS.SEVENTH_FLOOR_SAFE_MISREAD,
        beliefType: "misunderstands",
        confidence: 1,
        source: "rumor",
        floorIds: ["7F"],
        canSayDirectly: false,
        preferredExpression: "ask_back",
      }),
    ],
  },
  "N-002": {
    npcId: "N-002",
    floorIds: ["B1"],
    maxApartmentCauseKnowledgeLevel: "surface",
    beliefs: [
      belief({
        beliefId: "belief:N-002:B1_public_anomaly",
        npcId: "N-002",
        factId: NPC_KNOWLEDGE_FACT_IDS.B1_PUBLIC_ANOMALY,
        beliefType: "knows",
        confidence: 2,
        source: "same_floor",
        floorIds: ["B1"],
        canSayDirectly: true,
        preferredExpression: "direct",
      }),
      belief({
        beliefId: "belief:N-002:cause_surface",
        npcId: "N-002",
        factId: NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_SURFACE,
        beliefType: "suspects",
        confidence: 1,
        source: "witnessed",
        revealTier: REVEAL_TIER_RANK.surface,
        canSayDirectly: false,
        preferredExpression: "hint",
      }),
    ],
  },
  "N-003": {
    npcId: "N-003",
    floorIds: ["1F"],
    maxApartmentCauseKnowledgeLevel: "local_pattern",
    beliefs: [
      belief({
        beliefId: "belief:N-003:1F_public_anomaly",
        npcId: "N-003",
        factId: NPC_KNOWLEDGE_FACT_IDS.F1_PUBLIC_ANOMALY,
        beliefType: "knows",
        confidence: 2,
        source: "same_floor",
        floorIds: ["1F"],
        canSayDirectly: true,
        preferredExpression: "direct",
      }),
      belief({
        beliefId: "belief:N-003:cause_local_pattern",
        npcId: "N-003",
        factId: NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_LOCAL_PATTERN,
        beliefType: "suspects",
        confidence: 2,
        source: "role",
        revealTier: REVEAL_TIER_RANK.fracture,
        canSayDirectly: false,
        preferredExpression: "hint",
      }),
    ],
  },
  "N-004": {
    npcId: "N-004",
    floorIds: ["7F"],
    maxApartmentCauseKnowledgeLevel: "none",
    beliefs: [
      belief({
        beliefId: "belief:N-004:7F_public_anomaly",
        npcId: "N-004",
        factId: NPC_KNOWLEDGE_FACT_IDS.F7_PUBLIC_ANOMALY,
        beliefType: "knows",
        confidence: 2,
        source: "same_floor",
        floorIds: ["7F"],
        canSayDirectly: true,
        preferredExpression: "direct",
      }),
    ],
  },
  "N-010": {
    npcId: "N-010",
    floorIds: ["B1", "1F", "7F"],
    maxApartmentCauseKnowledgeLevel: "root_truth",
    beliefs: [
      belief({
        beliefId: "belief:N-010:cause_surface",
        npcId: "N-010",
        factId: NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_SURFACE,
        beliefType: "knows",
        confidence: 3,
        source: "witnessed",
        revealTier: REVEAL_TIER_RANK.surface,
        canSayDirectly: false,
        preferredExpression: "hint",
      }),
      belief({
        beliefId: "belief:N-010:cause_fragment",
        npcId: "N-010",
        factId: NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_FRAGMENT,
        beliefType: "suspects",
        confidence: 2,
        source: "deep_secret",
        revealTier: REVEAL_TIER_RANK.deep,
        canSayDirectly: false,
        preferredExpression: "hint",
      }),
      belief({
        beliefId: "belief:N-010:root_truth_locked",
        npcId: "N-010",
        factId: NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_ROOT_TRUTH,
        beliefType: "knows",
        confidence: 3,
        source: "deep_secret",
        revealTier: REVEAL_TIER_RANK.abyss,
        canSayDirectly: false,
        preferredExpression: "avoid",
      }),
      belief({
        beliefId: "belief:N-010:anchor_residue",
        npcId: "N-010",
        factId: NPC_KNOWLEDGE_FACT_IDS.XINLAN_ANCHOR_RESIDUE,
        beliefType: "suspects",
        confidence: 2,
        source: "session_committed",
        relatedNpcIds: ["player"],
        revealTier: REVEAL_TIER_RANK.fracture,
        canSayDirectly: false,
        preferredExpression: "hint",
      }),
    ],
  },
};

const ROOT_TRUTH_ALLOWED_NPC_IDS = new Set(["N-010"]);

function cloneProfile(profile: NpcBeliefProfile): NpcBeliefProfile {
  return {
    npcId: profile.npcId,
    floorIds: [...profile.floorIds],
    maxApartmentCauseKnowledgeLevel: profile.maxApartmentCauseKnowledgeLevel,
    beliefs: profile.beliefs.map((b) => ({
      ...b,
      floorIds: [...b.floorIds],
      relatedNpcIds: [...b.relatedNpcIds],
    })),
  };
}

export function getNpcBeliefProfile(npcId: string | null | undefined): NpcBeliefProfile {
  const id = normalizeNpcId(npcId);
  const profile = BELIEF_PROFILES[id];
  if (profile) return cloneProfile(profile);
  return {
    npcId: id,
    floorIds: [],
    maxApartmentCauseKnowledgeLevel: "none",
    beliefs: [],
  };
}

export function listNpcBeliefProfileIds(): string[] {
  return Object.keys(BELIEF_PROFILES);
}

export function getApartmentCauseKnowledgeLevel(
  npcId: string | null | undefined,
  maxRevealRank: RevealTierRank | number
): ApartmentCauseKnowledgeLevel {
  const id = normalizeNpcId(npcId);
  const profile = getNpcBeliefProfile(id);
  const maxLevel = profile.maxApartmentCauseKnowledgeLevel;
  const rank = Number.isFinite(Number(maxRevealRank)) ? Number(maxRevealRank) : 0;

  if (maxLevel === "root_truth") {
    if (ROOT_TRUTH_ALLOWED_NPC_IDS.has(id) && rank >= REVEAL_TIER_RANK.abyss) return "root_truth";
    if (rank >= REVEAL_TIER_RANK.deep) return "cause_fragment";
    if (rank >= REVEAL_TIER_RANK.fracture) return "local_pattern";
    return "surface";
  }

  if (LEVEL_RANK[maxLevel] >= LEVEL_RANK.cause_fragment && rank >= REVEAL_TIER_RANK.deep) {
    return "cause_fragment";
  }
  if (LEVEL_RANK[maxLevel] >= LEVEL_RANK.local_pattern && rank >= REVEAL_TIER_RANK.fracture) {
    return "local_pattern";
  }
  if (LEVEL_RANK[maxLevel] >= LEVEL_RANK.surface) return "surface";
  return "none";
}
