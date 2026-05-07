import type { NpcKnowledgePacket } from "@/lib/npcKnowledge/npcKnowledgeResolver";
import { NPC_KNOWLEDGE_FACT_IDS } from "@/lib/npcKnowledge/npcBeliefGraph";

export type NpcKnowledgeValidationIssueCode =
  | "npc_knows_forbidden_fact"
  | "npc_mentions_unknown_npc"
  | "npc_relationship_fabrication"
  | "floor_knowledge_overreach"
  | "root_cause_leak"
  | "rumor_stated_as_fact";

export type NpcKnowledgeValidationIssue = {
  code: NpcKnowledgeValidationIssueCode;
  detail?: string;
  anchor?: string;
  severity: "low" | "medium" | "high";
};

export type NpcKnowledgeValidationTelemetry = {
  totalIssues: number;
  byCode: Partial<Record<NpcKnowledgeValidationIssueCode, number>>;
  forbiddenFactHits: number;
  unknownNpcMentions: number;
  rootCauseLeakCount: number;
  rumorAsFactCount: number;
};

export type NpcKnowledgeValidationReport = {
  ok: boolean;
  issues: NpcKnowledgeValidationIssue[];
  telemetry: NpcKnowledgeValidationTelemetry;
};

export type ValidateNpcKnowledgeInNarrativeArgs = {
  narrative: string;
  speakerNpcId: string | null | undefined;
  npcKnowledgePacket: NpcKnowledgePacket | null | undefined;
  presentNpcIds: readonly string[];
  maxRevealRank: number;
};

const ROOT_CAUSE_RE =
  /(公寓|暗月|循环|校源).{0,10}(根因|真正原因|源头|真相)|根因|真正的源头|七锚闭环.{0,8}(根因|真相|源头)|纠错员/;
const UNCERTAIN_RE = /(听说|据说|传闻|有人说|像是|好像|也许|可能|不确定|我猜|他们说|别当真)/;
const MISUNDERSTOOD_MARKER_RE = /(以为|误以为|误会|错觉|看错|听错|不一定|别信|传错了)/;
const RELATION_WORD_RE = /(认识|旧识|朋友|欠|欠了|保护|罩着|害怕|惧怕|讨厌|恨|交易|躲着|同伙|同伴|私事)/;

const ROOT_CAUSE_ZH_RE =
  /(公寓|暗月|循环|校源).{0,10}(根因|真正原因|源头|真相)|根因|真正的源头|七锚闭环.{0,8}(根因|真相|源头)|纠错员/;
const RELATION_WORD_ZH_RE =
  /(认识|旧识|朋友|欠|欠了|保护|罩着|害怕|忌惮|讨厌|恨|交易|躲着|同伙|同伴|私事)/;

const FACT_KEYWORDS: Record<string, string[]> = {
  [NPC_KNOWLEDGE_FACT_IDS.B1_PUBLIC_ANOMALY]: ["B1", "地下", "负一", "地下室", "安全屋", "电梯"],
  [NPC_KNOWLEDGE_FACT_IDS.F1_PUBLIC_ANOMALY]: ["1F", "一层", "一楼", "大厅"],
  [NPC_KNOWLEDGE_FACT_IDS.F7_PUBLIC_ANOMALY]: ["7F", "七层", "七楼", "第七层"],
  [NPC_KNOWLEDGE_FACT_IDS.ELEVATOR_RUMOR]: ["电梯井", "电梯", "自己动", "吞人"],
  [NPC_KNOWLEDGE_FACT_IDS.SEVENTH_FLOOR_SAFE_MISREAD]: ["七层很安全", "七楼很安全", "7F很安全", "七层是安全的"],
  [NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_SURFACE]: ["公寓在变", "公寓不对", "规则在压"],
  [NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_LOCAL_PATTERN]: ["局部规律", "同一层的规律", "每层都在重复"],
  [NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_FRAGMENT]: ["校源", "碎片", "锚点", "闭环", "七锚"],
  [NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_ROOT_TRUTH]: ["根因", "真正原因", "源头", "纠错员", "七锚闭环的真相"],
  [NPC_KNOWLEDGE_FACT_IDS.XINLAN_ANCHOR_RESIDUE]: ["锚", "上一次", "旧循环", "记得你"],
};

function normalizeId(v: string | null | undefined): string {
  return String(v ?? "").trim();
}

function uniqueIds(values: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const value of values) {
    const id = normalizeId(value);
    if (id) out.add(id);
  }
  return [...out];
}

function narrativeHitsFact(narrative: string, factId: string): string | null {
  if (narrative.includes(factId)) return factId;
  const keywords = FACT_KEYWORDS[factId] ?? [];
  for (const keyword of keywords) {
    if (keyword.length >= 2 && narrative.includes(keyword)) return keyword;
  }
  return null;
}

function mentionedNpcIds(narrative: string): string[] {
  return uniqueIds(narrative.match(/\bN-\d{3,6}\b/g) ?? []);
}

function mentionedFloorIds(narrative: string): string[] {
  const out: string[] = [];
  if (/B1|地下.?一|负一|地下室/.test(narrative)) out.push("B1");
  if (/B2|地下.?二|负二/.test(narrative)) out.push("B2");
  if (/1F|一层|一楼/.test(narrative)) out.push("1F");
  if (/7F|七层|七楼|第七层/.test(narrative)) out.push("7F");
  return uniqueIds(out);
}

function packetAllowsFloor(packet: NpcKnowledgePacket, floorId: string): boolean {
  const f = floorId.toLowerCase();
  const allFactIds = [...packet.can_know_fact_ids, ...packet.can_hint_fact_ids];
  return allFactIds.some((id) => id.toLowerCase().includes(f));
}

function addIssue(issues: NpcKnowledgeValidationIssue[], issue: NpcKnowledgeValidationIssue): void {
  if (
    issues.some(
      (x) => x.code === issue.code && x.detail === issue.detail && x.anchor === issue.anchor
    )
  ) {
    return;
  }
  issues.push(issue);
}

export function validateNpcKnowledgeInNarrative(
  args: ValidateNpcKnowledgeInNarrativeArgs
): NpcKnowledgeValidationReport {
  const narrative = String(args.narrative ?? "");
  const packet = args.npcKnowledgePacket;
  const issues: NpcKnowledgeValidationIssue[] = [];
  if (!packet || !narrative.trim()) {
    return {
      ok: true,
      issues: [],
      telemetry: {
        totalIssues: 0,
        byCode: {},
        forbiddenFactHits: 0,
        unknownNpcMentions: 0,
        rootCauseLeakCount: 0,
        rumorAsFactCount: 0,
      },
    };
  }

  const speakerNpcId = normalizeId(args.speakerNpcId) || packet.speakerNpcId;
  const presentNpcIds = uniqueIds(args.presentNpcIds);
  const mentionableNpcIds = uniqueIds([
    speakerNpcId,
    ...presentNpcIds,
    ...packet.mentionable_npc_ids,
  ]);

  if (
    (ROOT_CAUSE_RE.test(narrative) || ROOT_CAUSE_ZH_RE.test(narrative)) &&
    (packet.apartment_cause_knowledge_level !== "root_truth" ||
      packet.expression_policy.root_truth_direct_allowed !== true)
  ) {
    addIssue(issues, {
      code: "root_cause_leak",
      detail: `speaker=${speakerNpcId}|level=${packet.apartment_cause_knowledge_level}`,
      severity: "high",
    });
  }

  for (const factId of packet.must_not_know_fact_ids) {
    const hit = narrativeHitsFact(narrative, factId);
    if (!hit) continue;
    addIssue(issues, {
      code: "npc_knows_forbidden_fact",
      detail: `fact=${factId}|hit=${hit}`,
      anchor: factId,
      severity: factId === NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_ROOT_TRUTH ? "high" : "medium",
    });
  }

  for (const rumorFactId of packet.expression_policy.rumor_fact_ids) {
    const hit = narrativeHitsFact(narrative, rumorFactId);
    if (hit && !UNCERTAIN_RE.test(narrative)) {
      addIssue(issues, {
        code: "rumor_stated_as_fact",
        detail: `fact=${rumorFactId}|hit=${hit}`,
        anchor: rumorFactId,
        severity: "medium",
      });
    }
  }

  for (const falseFactId of packet.expression_policy.misunderstood_fact_ids) {
    const hit = narrativeHitsFact(narrative, falseFactId);
    if (hit && !MISUNDERSTOOD_MARKER_RE.test(narrative)) {
      addIssue(issues, {
        code: "npc_knows_forbidden_fact",
        detail: `false_belief_as_truth=${falseFactId}|hit=${hit}`,
        anchor: falseFactId,
        severity: "medium",
      });
    }
  }

  for (const npcId of mentionedNpcIds(narrative)) {
    if (npcId === speakerNpcId) continue;
    if (!mentionableNpcIds.includes(npcId)) {
      addIssue(issues, {
        code: "npc_mentions_unknown_npc",
        detail: `npc=${npcId}`,
        anchor: npcId,
        severity: "medium",
      });
    }
    const hasEdge = packet.known_relation_edges.some((edge) => edge.to === npcId);
    if ((RELATION_WORD_RE.test(narrative) || RELATION_WORD_ZH_RE.test(narrative)) && !hasEdge && npcId !== speakerNpcId) {
      addIssue(issues, {
        code: "npc_relationship_fabrication",
        detail: `speaker=${speakerNpcId}|target=${npcId}`,
        anchor: npcId,
        severity: "medium",
      });
    }
  }

  const speakerFloorId = packet.speaker_floor_id;
  for (const floorId of mentionedFloorIds(narrative)) {
    if (!speakerFloorId || floorId === speakerFloorId) continue;
    if (!packetAllowsFloor(packet, floorId)) {
      addIssue(issues, {
        code: "floor_knowledge_overreach",
        detail: `speaker_floor=${speakerFloorId}|mentioned=${floorId}`,
        anchor: floorId,
        severity: "medium",
      });
    }
  }

  const byCode: Partial<Record<NpcKnowledgeValidationIssueCode, number>> = {};
  for (const issue of issues) byCode[issue.code] = (byCode[issue.code] ?? 0) + 1;

  return {
    ok: issues.length === 0,
    issues,
    telemetry: {
      totalIssues: issues.length,
      byCode,
      forbiddenFactHits: byCode.npc_knows_forbidden_fact ?? 0,
      unknownNpcMentions: byCode.npc_mentions_unknown_npc ?? 0,
      rootCauseLeakCount: byCode.root_cause_leak ?? 0,
      rumorAsFactCount: byCode.rumor_stated_as_fact ?? 0,
    },
  };
}
