import { NPC_KNOWLEDGE_FACT_IDS } from "@/lib/npcKnowledge/npcBeliefGraph";
import { REVEAL_TIER_RANK } from "@/lib/registry/revealTierRank";

export type WorldFactCategory =
  | "npc"
  | "floor"
  | "event"
  | "item"
  | "apartment_root"
  | "relationship"
  | "location"
  | "task"
  | "anomaly";

export type WorldFactTruthLevel =
  | "canon"
  | "session_committed"
  | "rumor"
  | "hypothesis"
  | "false_belief"
  | "candidate";

export type WorldFactSource =
  | "registry"
  | "story_ledger"
  | "world_engine"
  | "player_observed"
  | "npc_belief"
  | "system_repair";

export type WorldFact = {
  factId: string;
  content: string;
  category: WorldFactCategory;
  truthLevel: WorldFactTruthLevel;
  source: WorldFactSource;
  ownerNpcIds: string[];
  floorIds: string[];
  relatedNpcIds: string[];
  revealTier: number;
  createdTurnId?: string;
  expiresAtTurn?: number;
};

function fact(args: WorldFact): WorldFact {
  return {
    ...args,
    ownerNpcIds: [...args.ownerNpcIds],
    floorIds: [...args.floorIds],
    relatedNpcIds: [...args.relatedNpcIds],
  };
}

const WORLD_FACTS: WorldFact[] = [
  fact({
    factId: NPC_KNOWLEDGE_FACT_IDS.B1_PUBLIC_ANOMALY,
    content: "B1 has public pressure anomalies that same-floor NPCs may notice.",
    category: "floor",
    truthLevel: "canon",
    source: "registry",
    ownerNpcIds: [],
    floorIds: ["B1"],
    relatedNpcIds: [],
    revealTier: REVEAL_TIER_RANK.surface,
  }),
  fact({
    factId: NPC_KNOWLEDGE_FACT_IDS.F1_PUBLIC_ANOMALY,
    content: "1F has public spatial and timing anomalies.",
    category: "floor",
    truthLevel: "canon",
    source: "registry",
    ownerNpcIds: [],
    floorIds: ["1F"],
    relatedNpcIds: [],
    revealTier: REVEAL_TIER_RANK.surface,
  }),
  fact({
    factId: NPC_KNOWLEDGE_FACT_IDS.F7_PUBLIC_ANOMALY,
    content: "7F has a high-risk anomaly layer and must not be treated as safe by default.",
    category: "floor",
    truthLevel: "canon",
    source: "registry",
    ownerNpcIds: [],
    floorIds: ["7F"],
    relatedNpcIds: [],
    revealTier: REVEAL_TIER_RANK.fracture,
  }),
  fact({
    factId: NPC_KNOWLEDGE_FACT_IDS.ELEVATOR_RUMOR,
    content: "There is a rumor that the elevator moves or swallows people without a call.",
    category: "anomaly",
    truthLevel: "rumor",
    source: "npc_belief",
    ownerNpcIds: ["N-001"],
    floorIds: ["B1"],
    relatedNpcIds: [],
    revealTier: REVEAL_TIER_RANK.surface,
  }),
  fact({
    factId: NPC_KNOWLEDGE_FACT_IDS.SEVENTH_FLOOR_SAFE_MISREAD,
    content: "Some residents falsely believe the seventh floor is safe.",
    category: "floor",
    truthLevel: "false_belief",
    source: "npc_belief",
    ownerNpcIds: ["N-001"],
    floorIds: ["7F"],
    relatedNpcIds: [],
    revealTier: REVEAL_TIER_RANK.surface,
  }),
  fact({
    factId: NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_SURFACE,
    content: "The apartment has surface pressure patterns; this is not the root cause.",
    category: "apartment_root",
    truthLevel: "hypothesis",
    source: "registry",
    ownerNpcIds: [],
    floorIds: [],
    relatedNpcIds: [],
    revealTier: REVEAL_TIER_RANK.surface,
  }),
  fact({
    factId: NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_LOCAL_PATTERN,
    content: "Apartment changes appear as local floor patterns before deeper truth is available.",
    category: "apartment_root",
    truthLevel: "hypothesis",
    source: "registry",
    ownerNpcIds: [],
    floorIds: [],
    relatedNpcIds: [],
    revealTier: REVEAL_TIER_RANK.fracture,
  }),
  fact({
    factId: NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_FRAGMENT,
    content: "A cause fragment may be hinted by core NPCs at deep reveal only.",
    category: "apartment_root",
    truthLevel: "hypothesis",
    source: "npc_belief",
    ownerNpcIds: ["N-010"],
    floorIds: [],
    relatedNpcIds: ["N-010"],
    revealTier: REVEAL_TIER_RANK.deep,
  }),
  fact({
    factId: NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_ROOT_TRUTH,
    content: "The apartment root truth is abyss-tier and never a casual NPC explanation.",
    category: "apartment_root",
    truthLevel: "canon",
    source: "registry",
    ownerNpcIds: ["N-010"],
    floorIds: [],
    relatedNpcIds: ["N-010"],
    revealTier: REVEAL_TIER_RANK.abyss,
  }),
  fact({
    factId: NPC_KNOWLEDGE_FACT_IDS.XINLAN_ANCHOR_RESIDUE,
    content: "N-010 may carry anchor residue as a hint, not as a full truth claim.",
    category: "npc",
    truthLevel: "hypothesis",
    source: "npc_belief",
    ownerNpcIds: ["N-010"],
    floorIds: [],
    relatedNpcIds: ["N-010"],
    revealTier: REVEAL_TIER_RANK.fracture,
  }),
  fact({
    factId: "fact:relationship:N-001:N-002:neighbor",
    content: "N-001 and N-002 are B1 neighbors and may discuss shared B1 anomalies.",
    category: "relationship",
    truthLevel: "canon",
    source: "registry",
    ownerNpcIds: [],
    floorIds: ["B1"],
    relatedNpcIds: ["N-001", "N-002"],
    revealTier: REVEAL_TIER_RANK.surface,
  }),
  fact({
    factId: "fact:relationship:N-010:N-001:protects",
    content: "N-010 has a guarded protective relation toward N-001, gated behind fracture reveal.",
    category: "relationship",
    truthLevel: "hypothesis",
    source: "npc_belief",
    ownerNpcIds: ["N-010"],
    floorIds: ["B1"],
    relatedNpcIds: ["N-010", "N-001"],
    revealTier: REVEAL_TIER_RANK.fracture,
  }),
  fact({
    factId: "fact:event:B1:first_pressure_wave",
    content: "B1 pressure wave can be committed after player observation.",
    category: "event",
    truthLevel: "canon",
    source: "registry",
    ownerNpcIds: [],
    floorIds: ["B1"],
    relatedNpcIds: [],
    revealTier: REVEAL_TIER_RANK.surface,
  }),
  fact({
    factId: "fact:item:rust_key:unclaimed",
    content: "A rust key can be present as an unclaimed item until awarded by structured delta.",
    category: "item",
    truthLevel: "canon",
    source: "registry",
    ownerNpcIds: [],
    floorIds: ["B1"],
    relatedNpcIds: [],
    revealTier: REVEAL_TIER_RANK.surface,
  }),
];

const FACTS_BY_ID = new Map(WORLD_FACTS.map((f) => [f.factId, f]));

function cloneFact(factValue: WorldFact): WorldFact {
  return fact({ ...factValue });
}

export function getWorldFactById(factId: string | null | undefined): WorldFact | null {
  const id = String(factId ?? "").trim();
  const found = id ? FACTS_BY_ID.get(id) : null;
  return found ? cloneFact(found) : null;
}

export function getFactsForFloor(floorId: string | null | undefined, maxRevealRank: number): WorldFact[] {
  const id = String(floorId ?? "").trim();
  if (!id) return [];
  return WORLD_FACTS.filter((factValue) => factValue.floorIds.includes(id) && factValue.revealTier <= maxRevealRank).map(cloneFact);
}

export function getFactsForNpc(npcId: string | null | undefined, maxRevealRank: number): WorldFact[] {
  const id = String(npcId ?? "").trim();
  if (!id) return [];
  return WORLD_FACTS.filter(
    (factValue) =>
      factValue.revealTier <= maxRevealRank &&
      (factValue.ownerNpcIds.includes(id) || factValue.relatedNpcIds.includes(id))
  ).map(cloneFact);
}

export function canUseFactInNarrative(
  factId: string | null | undefined,
  actorId: string | null | undefined,
  maxRevealRank: number
): boolean {
  const factValue = getWorldFactById(factId);
  if (!factValue) return false;
  if (factValue.revealTier > maxRevealRank) return false;
  const actor = String(actorId ?? "").trim();
  if (!actor || actor === "__dm__" || actor === "player") return true;
  if (factValue.ownerNpcIds.length === 0 && factValue.relatedNpcIds.length === 0) return true;
  return factValue.ownerNpcIds.includes(actor) || factValue.relatedNpcIds.includes(actor);
}

export function isRootCauseFact(factId: string | null | undefined): boolean {
  const factValue = getWorldFactById(factId);
  return Boolean(factValue && factValue.category === "apartment_root");
}

export function listWorldFacts(maxRevealRank = Number.POSITIVE_INFINITY): WorldFact[] {
  return WORLD_FACTS.filter((factValue) => factValue.revealTier <= maxRevealRank).map(cloneFact);
}
