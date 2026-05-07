import type { NpcKnowledgePacket } from "@/lib/npcKnowledge/npcKnowledgeResolver";
import type { NarrativeAuditCandidateNewFact } from "@/lib/worldFacts/narrativeAudit";
import {
  getWorldFactById,
  isRootCauseFact,
  listWorldFacts,
  type WorldFact,
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
  candidateNewFactCount: number;
  strongFactWithoutEvidenceCount: number;
};

export type UnsupportedFactDetectorReport = {
  unsupportedCandidates: UnsupportedFactCandidate[];
  issueCodes: UnsupportedFactIssueCode[];
  telemetry: UnsupportedFactDetectorTelemetry;
};

export type DetectUnsupportedFactsArgs = {
  narrative: string;
  usedFactIds: readonly string[];
  candidateNewFacts?: readonly NarrativeAuditCandidateNewFact[];
  allowedFactIds: readonly string[];
  npcKnowledgePacket?: NpcKnowledgePacket | null;
  scenePublicFactIds: readonly string[];
  actorScopedFactIds: readonly string[];
  sessionCommittedFactIds?: readonly string[];
  maxRevealRank: number;
  stateDelta?: {
    playerLocation?: string;
    taskUpdates?: readonly { status?: string }[];
    newTasks?: readonly unknown[];
  } | null;
  dmRecord?: Record<string, unknown> | null;
};

const ROOT_CAUSE_RE =
  /(公寓|暗月|循环|校源).{0,10}(根因|真正原因|源头|真相)|根因|真正的源头|七锚闭环.{0,8}(根因|真相|源头)|纠错员/;
const RELATION_RE = /\b(N-\d{3,6})\b.{0,18}(认识|旧识|欠(?:了)?.{0,6}命|一直保护|保护|害怕|仇|交易|躲着).{0,18}\b(N-\d{3,6})\b/;
const LOCATION_RE = /(来到|抵达|进入|已经在|身处).{0,10}(B2|7F|七层|七楼|地下二层|负二)/;
const EVENT_STAGE_RE = /(进入|已经进入|开始|完成|结束).{0,10}(第二阶段|最终阶段|爆发阶段|吞噬阶段|事件阶段)/;
const ITEM_ACQUISITION_RE = /(捡起|拾起|获得|拿到|得到|收下|装进口袋|放进口袋|收入背包|放入背包).{0,18}(钥匙|徽章|卡|纸条|药|道具|物品|武器|刀|枪|箱|证件|硬币)/;
const NPC_DEEP_ROLE_RE = /\b(N-\d{3,6})\b.{0,18}(真实身份|深层身份|其实是|原本是|校源|辅锚|七锚|锚点|纠错员|管理员)/;
const TASK_COMPLETION_RE = /(任务|委托|目标|线索).{0,8}(已完成|完成了|已经完成|结束了|达成了|收束了)/;
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

function visibleAllowedFacts(args: DetectUnsupportedFactsArgs): WorldFact[] {
  const allowed = new Set(
    uniq([
      ...args.allowedFactIds,
      ...args.scenePublicFactIds,
      ...args.actorScopedFactIds,
      ...(args.sessionCommittedFactIds ?? []),
      ...listWorldFacts(args.maxRevealRank).map((fact) => fact.factId),
    ])
  );
  const facts: WorldFact[] = [];
  for (const factId of allowed) {
    const fact = getWorldFactById(factId);
    if (fact && fact.revealTier <= args.maxRevealRank) facts.push(fact);
  }
  return facts;
}

function isFactAllowed(fact: WorldFact, allowed: ReadonlySet<string>, maxRevealRank: number): boolean {
  return allowed.has(fact.factId) && fact.revealTier <= maxRevealRank;
}

function hasAllowedRootFact(facts: readonly WorldFact[]): boolean {
  return facts.some(
    (fact) =>
      fact.category === "apartment_root" &&
      fact.truthLevel === "canon" &&
      fact.factId.includes("root_truth")
  );
}

function hasRelationFact(facts: readonly WorldFact[], a: string, b: string): boolean {
  return facts.some(
    (fact) =>
      fact.category === "relationship" &&
      fact.relatedNpcIds.includes(a) &&
      fact.relatedNpcIds.includes(b)
  );
}

function hasUsedAllowedCategory(facts: readonly WorldFact[], category: WorldFactCategory): boolean {
  return facts.some((fact) => fact.category === category);
}

function hasStructuredAward(dmRecord: Record<string, unknown> | null | undefined): boolean {
  return (
    (Array.isArray(dmRecord?.awarded_items) && dmRecord.awarded_items.length > 0) ||
    (Array.isArray(dmRecord?.awarded_warehouse_items) && dmRecord.awarded_warehouse_items.length > 0)
  );
}

function hasTaskCompletionDelta(args: DetectUnsupportedFactsArgs): boolean {
  if ((args.stateDelta?.newTasks?.length ?? 0) > 0) return true;
  return (args.stateDelta?.taskUpdates ?? []).some((update) => {
    const status = String(update.status ?? "").trim();
    return status === "completed" || status === "failed";
  });
}

function locationClaimSupportedByDelta(args: DetectUnsupportedFactsArgs, claim: string): boolean {
  const claimed = /B2|地下二层|负二/.test(claim)
    ? "B2"
    : /7F|七层|七楼/.test(claim)
      ? "7F"
      : null;
  if (!claimed) return false;
  const deltaLocation = String(args.stateDelta?.playerLocation ?? args.dmRecord?.player_location ?? "");
  return deltaLocation.toUpperCase().includes(claimed);
}

export function detectUnsupportedFacts(args: DetectUnsupportedFactsArgs): UnsupportedFactDetectorReport {
  const narrative = String(args.narrative ?? "");
  const usedFactIds = uniq(args.usedFactIds);
  const allowed = new Set(
    uniq([
      ...args.allowedFactIds,
      ...args.scenePublicFactIds,
      ...args.actorScopedFactIds,
      ...(args.sessionCommittedFactIds ?? []),
      ...listWorldFacts(args.maxRevealRank).map((fact) => fact.factId),
    ])
  );
  const allowedFacts = visibleAllowedFacts(args);
  const usedAllowedFacts: WorldFact[] = [];
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
    if (!isFactAllowed(fact, allowed, args.maxRevealRank)) {
      pushCandidate(candidates, {
        code: "fact_id_not_allowed",
        factId,
        text: fact.content,
        category: fact.category,
        severity: isRootCauseFact(factId) ? "high" : "medium",
      });
    } else {
      usedAllowedFacts.push(fact);
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

  for (const candidateFact of args.candidateNewFacts ?? []) {
    pushCandidate(candidates, {
      code: "unsupported_new_fact",
      text: `candidate_new_fact_pending_review:${candidateFact.category ?? "unknown"}:${candidateFact.text}`,
      category: candidateFact.category,
      severity: "low",
    });
  }

  if (ROOT_CAUSE_RE.test(narrative)) {
    if (!hasAllowedRootFact(allowedFacts)) {
      pushCandidate(candidates, {
        code: "unsupported_root_cause_claim",
        text: "root_cause_claim_without_allowed_fact",
        category: "apartment_root",
        severity: "high",
      });
    }
    if (!hasUsedAllowedCategory(usedAllowedFacts, "apartment_root")) {
      pushCandidate(candidates, {
        code: "unsupported_new_fact",
        text: "root_cause_claim_without_used_fact_id",
        category: "apartment_root",
        severity: "high",
      });
    }
  }

  const relationMatch = narrative.match(RELATION_RE);
  if (relationMatch) {
    const a = relationMatch[1];
    const b = relationMatch[3];
    if (a && b && a !== b) {
      const supportedByFact = hasRelationFact(allowedFacts, a, b);
      const supportedByEdge = relationAllowed(args.npcKnowledgePacket, a, b);
      if (!supportedByFact && !supportedByEdge) {
        pushCandidate(candidates, {
          code: "unsupported_relationship_claim",
          text: relationMatch[0],
          category: "relationship",
          severity: "medium",
        });
      }
      if (!hasRelationFact(usedAllowedFacts, a, b) && !supportedByEdge) {
        pushCandidate(candidates, {
          code: "unsupported_new_fact",
          text: "relationship_claim_without_used_fact_id",
          category: "relationship",
          severity: "medium",
        });
      }
    }
  }

  const locationMatch = narrative.match(LOCATION_RE);
  if (
    locationMatch &&
    !hasUsedAllowedCategory(usedAllowedFacts, "location") &&
    !locationClaimSupportedByDelta(args, locationMatch[0])
  ) {
    pushCandidate(candidates, {
      code: "unsupported_location_claim",
      text: locationMatch[0],
      category: "location",
      severity: "medium",
    });
  }

  const eventMatch = narrative.match(EVENT_STAGE_RE);
  if (eventMatch && !hasUsedAllowedCategory(usedAllowedFacts, "event")) {
    pushCandidate(candidates, {
      code: "unsupported_event_stage_claim",
      text: eventMatch[0],
      category: "event",
      severity: "medium",
    });
  }

  const itemMatch = narrative.match(ITEM_ACQUISITION_RE);
  if (itemMatch && !hasUsedAllowedCategory(usedAllowedFacts, "item") && !hasStructuredAward(args.dmRecord)) {
    pushCandidate(candidates, {
      code: "unsupported_new_fact",
      text: "item_acquisition_without_fact_or_award",
      category: "item",
      severity: "medium",
    });
  }

  const npcRoleMatch = narrative.match(NPC_DEEP_ROLE_RE);
  if (npcRoleMatch && !hasUsedAllowedCategory(usedAllowedFacts, "npc")) {
    pushCandidate(candidates, {
      code: "unsupported_new_fact",
      text: "npc_identity_or_deep_role_without_fact_id",
      category: "npc",
      severity: /校源|辅锚|七锚|纠错员/.test(npcRoleMatch[0]) ? "high" : "medium",
    });
  }

  const taskMatch = narrative.match(TASK_COMPLETION_RE);
  if (taskMatch && !hasUsedAllowedCategory(usedAllowedFacts, "task") && !hasTaskCompletionDelta(args)) {
    pushCandidate(candidates, {
      code: "unsupported_new_fact",
      text: "task_completion_without_fact_or_delta",
      category: "task",
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
  const strongFactWithoutEvidenceCount = candidates.filter(
    (candidate) =>
      candidate.code === "unsupported_new_fact" &&
      /without_used_fact_id|without_fact_or|without_evidence|strong_fact_sentence_without_fact_id/.test(candidate.text)
  ).length;

  return {
    unsupportedCandidates: candidates,
    issueCodes: Object.keys(byCode) as UnsupportedFactIssueCode[],
    telemetry: {
      totalCandidates: candidates.length,
      byCode,
      usedFactIdCount: usedFactIds.length,
      missingRegistryFactIdCount: byCode.used_fact_id_missing_from_registry ?? 0,
      disallowedFactIdCount: byCode.fact_id_not_allowed ?? 0,
      candidateNewFactCount: args.candidateNewFacts?.length ?? 0,
      strongFactWithoutEvidenceCount,
    },
  };
}
