import {
  getApartmentCauseKnowledgeLevel,
  getNpcBeliefProfile,
  listNpcBeliefProfileIds,
  NPC_KNOWLEDGE_FACT_IDS,
  type ApartmentCauseKnowledgeLevel,
  type NpcBelief,
} from "@/lib/npcKnowledge/npcBeliefGraph";
import {
  canNpcMentionOtherNpc,
  getNpcRelationEdges,
  listKnownRelationNpcIds,
  type NpcRelationEdge,
} from "@/lib/npcRelations/npcRelationGraph";

export type NpcKnowledgePacketRelationEdge = {
  to: string;
  type: NpcRelationEdge["relationType"];
  intensity: NpcRelationEdge["intensity"];
  revealTier: number;
  knownToPlayer: boolean;
  shared: string[];
  speechBias: NpcRelationEdge["speechBias"];
};

export type NpcKnowledgeExpressionPolicy = {
  cause_level: ApartmentCauseKnowledgeLevel;
  root_truth_direct_allowed: boolean;
  cause_fragment_policy: "hint_only" | "not_available";
  rumor_policy: "must_mark_uncertain";
  false_belief_policy: "never_state_as_truth";
  private_relation_policy: "edge_required";
  rumor_fact_ids: string[];
  misunderstood_fact_ids: string[];
  hint_only_fact_ids: string[];
};

export type NpcKnowledgePacket = {
  schema: "npc_knowledge_packet_v1";
  speakerNpcId: string;
  location: string | null;
  speaker_floor_id: string | null;
  apartment_cause_knowledge_level: ApartmentCauseKnowledgeLevel;
  can_know_fact_ids: string[];
  can_hint_fact_ids: string[];
  must_not_know_fact_ids: string[];
  known_relation_edges: NpcKnowledgePacketRelationEdge[];
  mentionable_npc_ids: string[];
  forbidden_npc_ids: string[];
  expression_policy: NpcKnowledgeExpressionPolicy;
};

export type BuildNpcKnowledgePacketArgs = {
  speakerNpcId: string | null | undefined;
  presentNpcIds: readonly string[];
  location: string | null | undefined;
  floorId: string | null | undefined;
  maxRevealRank: number;
  playerKnownFactIds: readonly string[];
  scenePublicFactIds: readonly string[];
  activeTaskIds: readonly string[];
};

function normalizeId(v: string | null | undefined): string {
  return String(v ?? "").trim();
}

function uniq(values: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const v of values) {
    const t = normalizeId(v);
    if (t) out.add(t);
  }
  return [...out];
}

export function inferNpcKnowledgeFloorId(
  location: string | null | undefined,
  explicitFloorId?: string | null | undefined
): string | null {
  const explicit = normalizeId(explicitFloorId);
  if (explicit) return explicit.toUpperCase();
  const loc = normalizeId(location);
  if (!loc) return null;
  if (/B1|地下.?一|负一/.test(loc)) return "B1";
  if (/B2|地下.?二|负二/.test(loc)) return "B2";
  if (/7F|七层|七楼/.test(loc)) return "7F";
  if (/1F|一层|一楼/.test(loc)) return "1F";
  const floorMatch = loc.match(/\b(\d{1,2})F\b/i);
  if (floorMatch?.[1]) return `${floorMatch[1]}F`;
  return null;
}

function beliefAllowedToKnow(belief: NpcBelief, floorId: string | null, maxRevealRank: number): boolean {
  if (belief.revealTier > maxRevealRank) return false;
  if (belief.source === "same_floor") {
    return Boolean(floorId && belief.floorIds.includes(floorId));
  }
  if (belief.beliefType === "misunderstands" || belief.beliefType === "denies") return false;
  if (belief.beliefType === "rumor") return true;
  return belief.canSayDirectly;
}

function beliefAllowedToHint(belief: NpcBelief, floorId: string | null, maxRevealRank: number): boolean {
  if (belief.revealTier > maxRevealRank) return false;
  if (belief.source === "same_floor") return Boolean(floorId && belief.floorIds.includes(floorId));
  if (belief.beliefType === "misunderstands" || belief.beliefType === "denies") return false;
  return !belief.canSayDirectly || belief.preferredExpression === "hint";
}

function causeFactIdsForLevel(level: ApartmentCauseKnowledgeLevel): {
  canKnow: string[];
  canHint: string[];
  mustNotKnow: string[];
} {
  switch (level) {
    case "root_truth":
      return {
        canKnow: [NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_ROOT_TRUTH],
        canHint: [NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_FRAGMENT],
        mustNotKnow: [],
      };
    case "cause_fragment":
      return {
        canKnow: [],
        canHint: [NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_FRAGMENT],
        mustNotKnow: [NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_ROOT_TRUTH],
      };
    case "local_pattern":
      return {
        canKnow: [],
        canHint: [NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_LOCAL_PATTERN],
        mustNotKnow: [
          NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_FRAGMENT,
          NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_ROOT_TRUTH,
        ],
      };
    case "surface":
      return {
        canKnow: [],
        canHint: [NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_SURFACE],
        mustNotKnow: [
          NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_LOCAL_PATTERN,
          NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_FRAGMENT,
          NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_ROOT_TRUTH,
        ],
      };
    case "none":
    default:
      return {
        canKnow: [],
        canHint: [],
        mustNotKnow: [
          NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_SURFACE,
          NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_LOCAL_PATTERN,
          NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_FRAGMENT,
          NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_ROOT_TRUTH,
        ],
      };
  }
}

function compactEdge(edge: NpcRelationEdge): NpcKnowledgePacketRelationEdge {
  return {
    to: edge.toNpcId,
    type: edge.relationType,
    intensity: edge.intensity,
    revealTier: edge.revealTier,
    knownToPlayer: edge.knownToPlayer,
    shared: edge.knowledgeSharedFactIds.slice(0, 8),
    speechBias: edge.speechBias,
  };
}

export function buildNpcKnowledgePacket(args: BuildNpcKnowledgePacketArgs): NpcKnowledgePacket {
  const speakerNpcId = normalizeId(args.speakerNpcId);
  const location = normalizeId(args.location) || null;
  const floorId = inferNpcKnowledgeFloorId(location, args.floorId);
  const maxRevealRank = Number.isFinite(args.maxRevealRank) ? args.maxRevealRank : 0;
  const profile = getNpcBeliefProfile(speakerNpcId);
  const causeLevel = getApartmentCauseKnowledgeLevel(speakerNpcId, maxRevealRank);
  const causeFacts = causeFactIdsForLevel(causeLevel);

  const canKnow = new Set<string>(uniq(args.scenePublicFactIds));
  const canHint = new Set<string>();
  const mustNotKnow = new Set<string>(causeFacts.mustNotKnow);

  for (const factId of causeFacts.canKnow) canKnow.add(factId);
  for (const factId of causeFacts.canHint) canHint.add(factId);
  for (const factId of uniq(args.playerKnownFactIds)) {
    if (!canKnow.has(factId) && !canHint.has(factId)) mustNotKnow.add(factId);
  }

  for (const belief of profile.beliefs) {
    if (beliefAllowedToKnow(belief, floorId, maxRevealRank)) canKnow.add(belief.factId);
    else if (beliefAllowedToHint(belief, floorId, maxRevealRank)) canHint.add(belief.factId);
    else mustNotKnow.add(belief.factId);
  }

  const relationEdges = getNpcRelationEdges(speakerNpcId).filter((edge) => edge.revealTier <= maxRevealRank);
  for (const edge of relationEdges) {
    for (const factId of edge.knowledgeSharedFactIds) {
      if (
        factId === NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_ROOT_TRUTH ||
        factId === NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_FRAGMENT
      ) {
        canHint.add(factId);
      } else {
        canKnow.add(factId);
      }
    }
  }

  for (const factId of [...canKnow, ...canHint]) mustNotKnow.delete(factId);
  if (causeLevel !== "root_truth") {
    canKnow.delete(NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_ROOT_TRUTH);
    canHint.delete(NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_ROOT_TRUTH);
    mustNotKnow.add(NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_ROOT_TRUTH);
  }
  if (causeLevel !== "cause_fragment" && causeLevel !== "root_truth") {
    canKnow.delete(NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_FRAGMENT);
    canHint.delete(NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_FRAGMENT);
    mustNotKnow.add(NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_FRAGMENT);
  }

  const presentNpcIds = uniq(args.presentNpcIds);
  const relationTargets = relationEdges.map((edge) => edge.toNpcId);
  const mentionable = uniq([
    speakerNpcId,
    ...presentNpcIds,
    ...relationTargets.filter((target) => canNpcMentionOtherNpc(speakerNpcId, target, maxRevealRank)),
  ]);
  const knownNpcIds = uniq([...listKnownRelationNpcIds(), ...listNpcBeliefProfileIds()]);
  const forbidden = knownNpcIds.filter((id) => id !== speakerNpcId && !mentionable.includes(id)).slice(0, 12);

  const rumorFactIds = profile.beliefs
    .filter((b) => b.beliefType === "rumor" && b.revealTier <= maxRevealRank)
    .map((b) => b.factId);
  const misunderstoodFactIds = profile.beliefs
    .filter((b) => b.beliefType === "misunderstands" || b.beliefType === "denies")
    .map((b) => b.factId);
  const hintOnlyFactIds = uniq([
    ...profile.beliefs.filter((b) => !b.canSayDirectly || b.preferredExpression === "hint").map((b) => b.factId),
    ...causeFacts.canHint,
  ]).filter((id) => canHint.has(id));

  return {
    schema: "npc_knowledge_packet_v1",
    speakerNpcId,
    location,
    speaker_floor_id: floorId,
    apartment_cause_knowledge_level: causeLevel,
    can_know_fact_ids: [...canKnow].slice(0, 24),
    can_hint_fact_ids: [...canHint].slice(0, 24),
    must_not_know_fact_ids: [...mustNotKnow].slice(0, 24),
    known_relation_edges: relationEdges.map(compactEdge).slice(0, 8),
    mentionable_npc_ids: mentionable.slice(0, 12),
    forbidden_npc_ids: forbidden,
    expression_policy: {
      cause_level: causeLevel,
      root_truth_direct_allowed: causeLevel === "root_truth",
      cause_fragment_policy:
        causeLevel === "cause_fragment" || causeLevel === "root_truth" ? "hint_only" : "not_available",
      rumor_policy: "must_mark_uncertain",
      false_belief_policy: "never_state_as_truth",
      private_relation_policy: "edge_required",
      rumor_fact_ids: uniq(rumorFactIds).slice(0, 8),
      misunderstood_fact_ids: uniq(misunderstoodFactIds).slice(0, 8),
      hint_only_fact_ids: hintOnlyFactIds.slice(0, 12),
    },
  };
}

export function compactNpcKnowledgePacket(packet: NpcKnowledgePacket | null | undefined): Record<string, unknown> | null {
  if (!packet) return null;
  const factCode = (id: string): string =>
    (
      {
        "fact:floor:B1:public_anomaly": "B1A",
        "fact:floor:1F:public_anomaly": "1FA",
        "fact:floor:7F:public_anomaly": "7FA",
        "fact:rumor:elevator_moves_without_call": "ER",
        "fact:false:seventh_floor_is_safe": "7SAFE",
        "fact:apartment_cause:surface_pressure": "CS",
        "fact:apartment_cause:local_pattern": "CL",
        "fact:apartment_cause:cause_fragment": "CF",
        "fact:apartment_cause:root_truth": "CR",
        "fact:npc:N-010:anchor_residue": "XA",
      } as Record<string, string>
    )[id] ?? id;
  return {
    sch: "nkg",
    n: packet.speakerNpcId,
    f: packet.speaker_floor_id,
    l: packet.apartment_cause_knowledge_level,
    k: packet.can_know_fact_ids.slice(0, 10).map(factCode),
    h: packet.can_hint_fact_ids.slice(0, 8).map(factCode),
    x: packet.must_not_know_fact_ids.slice(0, 10).map(factCode),
    r: packet.known_relation_edges.slice(0, 4).map((edge) => ({
      to: edge.to,
      t: edge.type,
      i: edge.intensity,
      sh: edge.shared.slice(0, 4).map(factCode),
      b: edge.speechBias,
    })),
    m: packet.mentionable_npc_ids.slice(0, 8),
    q: packet.forbidden_npc_ids.slice(0, 8),
    p: {
      root: packet.expression_policy.root_truth_direct_allowed ? 1 : 0,
      frag: packet.expression_policy.cause_fragment_policy === "hint_only" ? 1 : 0,
      rum: packet.expression_policy.rumor_fact_ids.slice(0, 4).map(factCode),
      false: packet.expression_policy.misunderstood_fact_ids.slice(0, 4).map(factCode),
      ho: packet.expression_policy.hint_only_fact_ids.slice(0, 6).map(factCode),
    },
  };
}
