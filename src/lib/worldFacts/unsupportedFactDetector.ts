import type { NpcKnowledgePacket } from "@/lib/npcKnowledge/npcKnowledgeResolver";
import {
  getWorldFactById,
  isRootCauseFact,
  type WorldFactCategory,
} from "@/lib/worldFacts/worldFactRegistry";

export type UnsupportedFactIssueCode =
  | "unsupported_new_fact"
  | "unsupported_relationship_claim"
  | "unsupported_root_cause_claim"
  | "unsupported_location_claim"
  | "unsupported_event_stage_claim"
  | "fact_id_not_allowed"
  | "used_fact_id_missing_from_registry";

export type UnsupportedFactCandidate = {
  code: UnsupportedFactIssueCode;
  text: string;
  factId?: string;
  category?: WorldFactCategory;
  severity: "low" | "medium" | "high";
};

export type UnsupportedFactDetectorTelemetry = {
  totalCandidates: number;
  byCode: Partial<Record<UnsupportedFactIssueCode, number>>;
  usedFactIdCount: number;
  missingRegistryFactIdCount: number;
  disallowedFactIdCount: number;
};

export type UnsupportedFactDetectorReport = {
  unsupportedCandidates: UnsupportedFactCandidate[];
  issueCodes: UnsupportedFactIssueCode[];
  telemetry: UnsupportedFactDetectorTelemetry;
};

export type DetectUnsupportedFactsArgs = {
  narrative: string;
  usedFactIds: readonly string[];
  allowedFactIds: readonly string[];
  npcKnowledgePacket?: NpcKnowledgePacket | null;
  scenePublicFactIds: readonly string[];
  actorScopedFactIds: readonly string[];
  maxRevealRank: number;
};

const ROOT_CAUSE_RE =
  /(公寓|暗月|循环|校源).{0,10}(根因|真正原因|源头|真相)|根因|真正的源头|七锚闭环.{0,8}(根因|真相|源头)|纠错员/;
const RELATION_RE = /\b(N-\d{3,6})\b.{0,18}(认识|旧识|欠(?:了)?.{0,6}命|一直保护|保护|害怕|仇|交易|躲着).{0,18}\b(N-\d{3,6})\b/;
const LOCATION_RE = /(来到|抵达|进入|已经在|身处).{0,10}(B2|7F|七层|七楼|地下二层|负二)/;
const EVENT_STAGE_RE = /(进入|已经进入|开始|完成|结束).{0,10}(第二阶段|最终阶段|爆发阶段|吞噬阶段|事件阶段)/;
const STRONG_FACT_RE = /(就是|真正|确定|已经|必然|一直|早就|从来都|所有人都知道)/;
const UNCERTAIN_RE = /(听说|据说|传闻|有人说|像是|好像|也许|可能|不确定|我猜|他们说|别当真)/;

function uniq(values: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) out.add(text);
  }
  return [...out];
}

function pushCandidate(out: UnsupportedFactCandidate[], candidate: UnsupportedFactCandidate): void {
  if (
    out.some(
      (x) =>
        x.code === candidate.code &&
        x.factId === candidate.factId &&
        x.text === candidate.text
    )
  ) {
    return;
  }
  out.push(candidate);
}

function relationAllowed(packet: NpcKnowledgePacket | null | undefined, a: string, b: string): boolean {
  if (!packet) return false;
  if (packet.mentionable_npc_ids.includes(a) && packet.mentionable_npc_ids.includes(b)) {
    return packet.known_relation_edges.some(
      (edge) =>
        (packet.speakerNpcId === a && edge.to === b) ||
        (packet.speakerNpcId === b && edge.to === a)
    );
  }
  return false;
}

function hasAllowedRootFact(allowedFactIds: readonly string[], maxRevealRank: number): boolean {
  return allowedFactIds.some((factId) => {
    const fact = getWorldFactById(factId);
    return (
      fact &&
      fact.category === "apartment_root" &&
      fact.truthLevel === "canon" &&
      fact.factId.includes("root_truth") &&
      fact.revealTier <= maxRevealRank
    );
  });
}

export function detectUnsupportedFacts(args: DetectUnsupportedFactsArgs): UnsupportedFactDetectorReport {
  const narrative = String(args.narrative ?? "");
  const usedFactIds = uniq(args.usedFactIds);
  const allowed = new Set(uniq([...args.allowedFactIds, ...args.scenePublicFactIds, ...args.actorScopedFactIds]));
  const candidates: UnsupportedFactCandidate[] = [];

  for (const factId of usedFactIds) {
    const fact = getWorldFactById(factId);
    if (!fact) {
      pushCandidate(candidates, {
        code: "used_fact_id_missing_from_registry",
        factId,
        text: factId,
        severity: "medium",
      });
      continue;
    }
    if (!allowed.has(factId) || fact.revealTier > args.maxRevealRank) {
      pushCandidate(candidates, {
        code: "fact_id_not_allowed",
        factId,
        text: fact.content,
        category: fact.category,
        severity: isRootCauseFact(factId) ? "high" : "medium",
      });
    }
    if ((fact.truthLevel === "rumor" || fact.truthLevel === "hypothesis") && !UNCERTAIN_RE.test(narrative)) {
      pushCandidate(candidates, {
        code: "unsupported_new_fact",
        factId,
        text: "rumor_or_hypothesis_stated_as_fact",
        category: fact.category,
        severity: "medium",
      });
    }
  }

  if (ROOT_CAUSE_RE.test(narrative) && !hasAllowedRootFact([...allowed], args.maxRevealRank)) {
    pushCandidate(candidates, {
      code: "unsupported_root_cause_claim",
      text: "root_cause_claim_without_allowed_fact",
      category: "apartment_root",
      severity: "high",
    });
  }

  const relationMatch = narrative.match(RELATION_RE);
  if (relationMatch) {
    const a = relationMatch[1];
    const b = relationMatch[3];
    if (a && b && a !== b && !relationAllowed(args.npcKnowledgePacket, a, b)) {
      pushCandidate(candidates, {
        code: "unsupported_relationship_claim",
        text: relationMatch[0],
        category: "relationship",
        severity: "medium",
      });
    }
  }

  const locationMatch = narrative.match(LOCATION_RE);
  if (locationMatch && !usedFactIds.some((factId) => getWorldFactById(factId)?.category === "location")) {
    pushCandidate(candidates, {
      code: "unsupported_location_claim",
      text: locationMatch[0],
      category: "location",
      severity: "medium",
    });
  }

  const eventMatch = narrative.match(EVENT_STAGE_RE);
  if (eventMatch && !usedFactIds.some((factId) => getWorldFactById(factId)?.category === "event")) {
    pushCandidate(candidates, {
      code: "unsupported_event_stage_claim",
      text: eventMatch[0],
      category: "event",
      severity: "medium",
    });
  }

  if (
    narrative.length > 0 &&
    usedFactIds.length === 0 &&
    candidates.length === 0 &&
    STRONG_FACT_RE.test(narrative)
  ) {
    pushCandidate(candidates, {
      code: "unsupported_new_fact",
      text: "strong_fact_sentence_without_fact_id",
      severity: "low",
    });
  }

  const byCode: Partial<Record<UnsupportedFactIssueCode, number>> = {};
  for (const candidate of candidates) byCode[candidate.code] = (byCode[candidate.code] ?? 0) + 1;

  return {
    unsupportedCandidates: candidates,
    issueCodes: Object.keys(byCode) as UnsupportedFactIssueCode[],
    telemetry: {
      totalCandidates: candidates.length,
      byCode,
      usedFactIdCount: usedFactIds.length,
      missingRegistryFactIdCount: byCode.used_fact_id_missing_from_registry ?? 0,
      disallowedFactIdCount: byCode.fact_id_not_allowed ?? 0,
    },
  };
}
