import { NPC_KNOWLEDGE_FACT_IDS } from "@/lib/npcKnowledge/npcBeliefGraph";

export type NpcRelationType =
  | "same_floor"
  | "neighbor"
  | "knows"
  | "fears"
  | "protects"
  | "owes"
  | "hates"
  | "hides_from"
  | "trades_with"
  | "past_loop_link";

export type NpcRelationEdge = {
  fromNpcId: string;
  toNpcId: string;
  relationType: NpcRelationType;
  intensity: 0 | 1 | 2 | 3;
  knownToPlayer: boolean;
  revealTier: number;
  knowledgeSharedFactIds: string[];
  speechBias: "neutral" | "guarded" | "soft" | "fearful" | "hostile" | "evasive";
};

function edge(args: NpcRelationEdge): NpcRelationEdge {
  return {
    ...args,
    knowledgeSharedFactIds: [...args.knowledgeSharedFactIds],
  };
}

const RELATION_EDGES: NpcRelationEdge[] = [
  edge({
    fromNpcId: "N-001",
    toNpcId: "N-002",
    relationType: "neighbor",
    intensity: 2,
    knownToPlayer: true,
    revealTier: 0,
    knowledgeSharedFactIds: [
      NPC_KNOWLEDGE_FACT_IDS.B1_PUBLIC_ANOMALY,
      NPC_KNOWLEDGE_FACT_IDS.ELEVATOR_RUMOR,
    ],
    speechBias: "guarded",
  }),
  edge({
    fromNpcId: "N-002",
    toNpcId: "N-001",
    relationType: "neighbor",
    intensity: 2,
    knownToPlayer: true,
    revealTier: 0,
    knowledgeSharedFactIds: [NPC_KNOWLEDGE_FACT_IDS.B1_PUBLIC_ANOMALY],
    speechBias: "soft",
  }),
  edge({
    fromNpcId: "N-010",
    toNpcId: "N-001",
    relationType: "protects",
    intensity: 2,
    knownToPlayer: false,
    revealTier: 1,
    knowledgeSharedFactIds: [
      NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_SURFACE,
      NPC_KNOWLEDGE_FACT_IDS.XINLAN_ANCHOR_RESIDUE,
    ],
    speechBias: "evasive",
  }),
  edge({
    fromNpcId: "N-001",
    toNpcId: "N-010",
    relationType: "knows",
    intensity: 1,
    knownToPlayer: false,
    revealTier: 1,
    knowledgeSharedFactIds: [NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_SURFACE],
    speechBias: "guarded",
  }),
  edge({
    fromNpcId: "N-003",
    toNpcId: "N-010",
    relationType: "fears",
    intensity: 2,
    knownToPlayer: false,
    revealTier: 2,
    knowledgeSharedFactIds: [NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_FRAGMENT],
    speechBias: "fearful",
  }),
  edge({
    fromNpcId: "N-004",
    toNpcId: "N-003",
    relationType: "trades_with",
    intensity: 1,
    knownToPlayer: false,
    revealTier: 1,
    knowledgeSharedFactIds: [NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_LOCAL_PATTERN],
    speechBias: "guarded",
  }),
  edge({
    fromNpcId: "N-010",
    toNpcId: "N-003",
    relationType: "past_loop_link",
    intensity: 2,
    knownToPlayer: false,
    revealTier: 2,
    knowledgeSharedFactIds: [NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_FRAGMENT],
    speechBias: "evasive",
  }),
];

function normalizeNpcId(npcId: string | null | undefined): string {
  return String(npcId ?? "").trim();
}

function isVisible(edge: NpcRelationEdge, maxRevealRank: number): boolean {
  return Number.isFinite(maxRevealRank) && maxRevealRank >= edge.revealTier;
}

export function getNpcRelationEdges(npcId: string | null | undefined): NpcRelationEdge[] {
  const id = normalizeNpcId(npcId);
  if (!id) return [];
  return RELATION_EDGES.filter((e) => e.fromNpcId === id).map((e) => ({
    ...e,
    knowledgeSharedFactIds: [...e.knowledgeSharedFactIds],
  }));
}

export function listKnownRelationNpcIds(): string[] {
  const ids = new Set<string>();
  for (const e of RELATION_EDGES) {
    ids.add(e.fromNpcId);
    ids.add(e.toNpcId);
  }
  return [...ids].sort();
}

export function canNpcMentionOtherNpc(
  speakerNpcId: string | null | undefined,
  targetNpcId: string | null | undefined,
  maxRevealRank: number
): boolean {
  const speaker = normalizeNpcId(speakerNpcId);
  const target = normalizeNpcId(targetNpcId);
  if (!speaker || !target) return false;
  if (speaker === target) return true;
  return getNpcRelationEdges(speaker).some((e) => e.toNpcId === target && isVisible(e, maxRevealRank));
}

export function getSharedKnowledgeFactIds(
  speakerNpcId: string | null | undefined,
  targetNpcId: string | null | undefined,
  maxRevealRank: number
): string[] {
  const target = normalizeNpcId(targetNpcId);
  if (!target) return [];
  const out = new Set<string>();
  for (const e of getNpcRelationEdges(speakerNpcId)) {
    if (e.toNpcId === target && isVisible(e, maxRevealRank)) {
      for (const factId of e.knowledgeSharedFactIds) out.add(factId);
    }
  }
  return [...out];
}
