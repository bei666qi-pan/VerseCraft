import test from "node:test";
import assert from "node:assert/strict";
import {
  extractFactKeywords,
  validateNarrative,
  type ValidateNarrativeArgs,
} from "@/lib/turnEngine/validateNarrative";
import { emptyStateDelta } from "@/lib/turnEngine/computeStateDelta";
import type { EpistemicFilterResult } from "@/lib/turnEngine/epistemic/types";
import type { KnowledgeFact } from "@/lib/epistemic/types";
import type { NormalizedPlayerIntent } from "@/lib/turnEngine/types";
import { buildNpcKnowledgePacket } from "@/lib/npcKnowledge/npcKnowledgeResolver";
import { NPC_KNOWLEDGE_FACT_IDS } from "@/lib/npcKnowledge/npcBeliefGraph";
import { REVEAL_TIER_RANK } from "@/lib/registry/revealTierRank";

function makeRejectedReasons(): EpistemicFilterResult["telemetry"]["rejectedReasons"] {
  return {
    player_private_locked_to_player: 0,
    dm_only_world_truth: 0,
    other_npc_private_memory: 0,
    scope_shared_scene_ok_to_infer: 0,
    scope_public_ok: 0,
    actor_owned_private: 0,
    player_actor_owns_fact: 0,
    floor_shared: 0,
    relation_shared: 0,
    rumor_network: 0,
    role_based: 0,
    reveal_tier_below_threshold: 0,
    xinlan_exception_not_propagated: 0,
    expired_fact_dropped: 0,
  };
}

function makeFilter(partial: Partial<EpistemicFilterResult> = {}): EpistemicFilterResult {
  return {
    dmOnlyFacts: [],
    scenePublicFacts: [],
    playerOnlyFacts: [],
    actorScopedFacts: [],
    residueFacts: [],
    telemetry: {
      totalInputFacts: 0,
      bucketCounts: { dmOnly: 0, scenePublic: 0, playerOnly: 0, actorScoped: 0, residue: 0 },
      rejectedReasons: makeRejectedReasons(),
      revealGatedCount: 0,
      actorIsXinlanException: false,
      actorId: null,
    },
    ...partial,
  };
}

function makeFact(content: string, scope: KnowledgeFact["scope"] = "world"): KnowledgeFact {
  return {
    id: `f_${Math.random().toString(36).slice(2, 8)}`,
    content,
    scope,
    sourceType: "system_canon",
    certainty: "confirmed",
    visibleTo: [],
    inferableByOthers: false,
    tags: [],
    createdAt: "2026-05-07T00:00:00.000Z",
  };
}

function makeIntent(partial: Partial<NormalizedPlayerIntent> = {}): NormalizedPlayerIntent {
  return {
    rawText: "走向窗边",
    normalizedText: "走向窗边",
    kind: "explore",
    slots: {},
    riskTags: [],
    isSystemTransition: false,
    isFirstAction: false,
    clientPurpose: "normal",
    ...partial,
  };
}

function baseArgs(overrides: Partial<ValidateNarrativeArgs> = {}): ValidateNarrativeArgs {
  return {
    dmRecord: {
      narrative: "你贴着墙根往前走，远处传来水滴声。",
      options: ["继续前进", "侧耳细听", "回身后退", "贴墙观察"],
      player_location: "三楼走廊",
    },
    delta: { ...emptyStateDelta(), playerLocation: "三楼走廊", isActionLegal: true },
    intent: makeIntent(),
    ...overrides,
  };
}

test("validateNarrative returns ok when nothing suspicious", () => {
  const report = validateNarrative(baseArgs());
  assert.equal(report.ok, true);
  assert.equal(report.issues.length, 0);
  assert.equal(report.optionsOverride, null);
  assert.equal(report.narrativeOverride, null);
});

test("validateNarrative extracts overlapping CJK keywords", () => {
  const keywords = extractFactKeywords("七锚闭环的根因在于纠错员");
  // "七锚闭", "锚闭环", "闭环的", ...  ensure common overlap chunks exist.
  assert.ok(keywords.includes("七锚闭"));
  assert.ok(keywords.includes("锚闭环"));
});

test("validateNarrative flags DM-only fact leak in narrative and falls back", () => {
  const filter = makeFilter({
    // Cast because the brand is nominal-only and we do not re-run filterFacts here.
    dmOnlyFacts: [makeFact("七锚闭环的根因在于纠错员") as never],
    telemetry: {
      totalInputFacts: 1,
      bucketCounts: { dmOnly: 1, scenePublic: 0, playerOnly: 0, actorScoped: 0, residue: 0 },
      rejectedReasons: makeRejectedReasons(),
      revealGatedCount: 0,
      actorIsXinlanException: false,
      actorId: null,
    },
  });
  const report = validateNarrative(
    baseArgs({
      dmRecord: {
        narrative: "他压低声音说，七锚闭环正在缓慢推进。",
        options: ["继续走", "转身", "靠墙", "停下"],
        player_location: "三楼走廊",
      },
      epistemicFilter: filter,
    })
  );
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((x) => x.code === "dm_only_fact_leaked_in_narrative"));
  assert.ok(report.narrativeOverride, "high severity should produce safe narrative fallback");
  assert.equal(report.telemetry.safeNarrativeFallbackApplied, true);
});

test("validateNarrative ignores low-signal scene overlap in DM-only facts", () => {
  const filter = makeFilter({
    dmOnlyFacts: [makeFact("走廊深处的门缝里传来低低的刮擦声") as never],
    telemetry: {
      totalInputFacts: 1,
      bucketCounts: { dmOnly: 1, scenePublic: 0, playerOnly: 0, actorScoped: 0, residue: 0 },
      rejectedReasons: makeRejectedReasons(),
      revealGatedCount: 0,
      actorIsXinlanException: false,
      actorId: null,
    },
  });
  const report = validateNarrative(
    baseArgs({
      dmRecord: {
        narrative: "我贴着墙根停下，走廊深处有一点刮擦声。动静很轻，像在试探我的位置。",
        options: ["贴墙靠近", "退到楼梯口", "丢出纸团", "低声试探"],
        player_location: "旧公寓三楼走廊",
      },
      epistemicFilter: filter,
    })
  );
  assert.equal(report.issues.some((x) => x.code === "dm_only_fact_leaked_in_narrative"), false);
  assert.equal(report.narrativeOverride, null);
});

test("validateNarrative flags location conflict when intent is not a system transition", () => {
  const report = validateNarrative(
    baseArgs({
      dmRecord: {
        narrative: "...",
        options: ["a", "b", "c", "d"],
        player_location: "公寓天台",
      },
      delta: { ...emptyStateDelta(), playerLocation: "三楼走廊", isActionLegal: true },
    })
  );
  assert.ok(report.issues.some((x) => x.code === "location_conflict_with_delta"));
});

test("validateNarrative ignores location mismatch on system transition turns", () => {
  const report = validateNarrative(
    baseArgs({
      dmRecord: {
        narrative: "结算画面淡入。",
        options: ["继续", "返回", "结算", "暂停"],
        player_location: "结算中",
      },
      delta: { ...emptyStateDelta(), playerLocation: "三楼走廊", isActionLegal: true },
      intent: makeIntent({ isSystemTransition: true, kind: "system_transition" }),
    })
  );
  assert.ok(!report.issues.some((x) => x.code === "location_conflict_with_delta"));
});

test("validateNarrative flags reveal tier breach via telemetry", () => {
  const filter = makeFilter();
  (filter.telemetry as { revealGatedCount: number }).revealGatedCount = 2;
  const report = validateNarrative(baseArgs({ epistemicFilter: filter }));
  assert.ok(report.issues.some((x) => x.code === "reveal_tier_breach"));
});

test("validateNarrative flags offscreen NPC id in options", () => {
  const report = validateNarrative(
    baseArgs({
      dmRecord: {
        narrative: "...",
        options: ["去找 N-999 确认情况", "继续前进", "侧耳细听", "贴墙观察"],
        player_location: "三楼走廊",
      },
      sceneNpcIds: ["N-001", "N-010"],
    })
  );
  assert.ok(report.issues.some((x) => x.code === "offscreen_npc_referenced_in_options"));
  // 修复后：optionsOverride 为空数组，表示“清空信号”——caller 需要再次调用大模型实时生成，
  // 不再注入既定罐头短句冒充模型输出。
  assert.ok(Array.isArray(report.optionsOverride), "options override signal should be present");
  assert.equal(report.optionsOverride?.length, 0, "override is a clear-signal, not canned text");
});

test("validateNarrative flags empty and duplicate options", () => {
  const empty = validateNarrative(
    baseArgs({ dmRecord: { narrative: "...", options: [], player_location: "三楼走廊" } })
  );
  assert.ok(empty.issues.some((x) => x.code === "options_empty_or_degenerate"));
  const dup = validateNarrative(
    baseArgs({
      dmRecord: {
        narrative: "...",
        options: ["继续观察", "继续观察"],
        player_location: "三楼走廊",
      },
    })
  );
  assert.ok(dup.issues.some((x) => x.code === "options_duplicate_only"));
});

test("validateNarrative flags combat option on degraded turn", () => {
  const delta = { ...emptyStateDelta(), isActionLegal: false as const, mustDegrade: true };
  const report = validateNarrative(
    baseArgs({
      dmRecord: {
        narrative: "无法行动。",
        options: ["攻击门后的影子", "原地等待", "后退一步", "观察"],
        player_location: "三楼走廊",
      },
      delta,
    })
  );
  assert.ok(report.issues.some((x) => x.code === "options_conflict_with_scene_affordance"));
  assert.ok(Array.isArray(report.optionsOverride));
  assert.equal(report.optionsOverride?.length, 0, "override is a clear-signal, not canned text");
});

test("validateNarrative flags inventory_conflict when narrative acquires without awards", () => {
  const report = validateNarrative(
    baseArgs({
      dmRecord: {
        narrative: "你捡起地上的黄铜钥匙，把它放进口袋。",
        options: ["继续前进", "敲门", "侧耳细听", "贴墙观察"],
        player_location: "三楼走廊",
        awarded_items: [],
        awarded_warehouse_items: [],
      },
    })
  );
  assert.ok(report.issues.some((x) => x.code === "inventory_conflict"));
});

test("validateNarrative does NOT flag inventory_conflict when awarded_items present", () => {
  const report = validateNarrative(
    baseArgs({
      dmRecord: {
        narrative: "你捡起地上的黄铜钥匙。",
        options: ["继续前进", "敲门", "侧耳细听", "贴墙观察"],
        player_location: "三楼走廊",
        awarded_items: [{ id: "i_key_brass", name: "黄铜钥匙", quantity: 1 }],
      },
    })
  );
  assert.ok(!report.issues.some((x) => x.code === "inventory_conflict"));
});

test("validateNarrative flags time_feel_drift when consumesTime=false but narrative says long duration", () => {
  const delta = {
    ...emptyStateDelta(),
    isActionLegal: true as const,
    consumesTime: false,
    timeCost: "free" as const,
    playerLocation: "三楼走廊",
  };
  const report = validateNarrative(
    baseArgs({
      dmRecord: {
        narrative: "过去了好几分钟，你才回过神来。",
        options: ["继续前进", "敲门", "侧耳细听", "贴墙观察"],
        player_location: "三楼走廊",
      },
      delta,
    })
  );
  assert.ok(report.issues.some((x) => x.code === "time_feel_drift"));
});

test("validateNarrative flags task_mode_mismatch when narrative claims completion without delta", () => {
  const report = validateNarrative(
    baseArgs({
      dmRecord: {
        narrative: "委托已完成，你松了一口气。",
        options: ["继续前进", "敲门", "侧耳细听", "贴墙观察"],
        player_location: "三楼走廊",
      },
    })
  );
  assert.ok(report.issues.some((x) => x.code === "task_mode_mismatch"));
});

test("validateNarrative bridges npcConsistencyIssueCount into report", () => {
  const report = validateNarrative(
    baseArgs({
      npcConsistencyIssueCount: 3,
    })
  );
  assert.ok(report.issues.some((x) => x.code === "npc_consistency_bridge"));
  assert.equal(report.telemetry.byCode.npc_consistency_bridge, 1);
});

test("validateNarrative bridges style validator without safe fallback", () => {
  const report = validateNarrative(
    baseArgs({
      dmRecord: {
        narrative: "系统提示：任务已完成，你获得了钥匙。",
        options: ["贴墙观察", "收好钥匙", "听楼上", "退到门边"],
        player_location: "涓夋ゼ璧板粖",
      },
      narrativeStyleValidationEnabled: true,
      narrativeStyleFocus: "investigate",
    })
  );
  assert.equal(report.narrativeOverride, null);
  assert.ok(report.issues.some((x) => x.code === "mechanical_exposition"));
  assert.ok((report.telemetry.narrativeStyleIssueCount ?? 0) > 0);
});

test("validateNarrative bridges NPC knowledge validator", () => {
  const npcKnowledgePacket = buildNpcKnowledgePacket({
    speakerNpcId: "N-001",
    presentNpcIds: ["N-001"],
    location: "B1_SafeZone",
    floorId: "B1",
    maxRevealRank: 0,
    playerKnownFactIds: [],
    scenePublicFactIds: [],
    activeTaskIds: [],
  });
  const report = validateNarrative(
    baseArgs({
      dmRecord: {
        narrative: "N-001说，公寓的根因就是七锚闭环的真相。",
        options: ["退后", "观察", "沉默", "追问"],
        player_location: "B1_SafeZone",
      },
      sceneNpcIds: ["N-001"],
      npcKnowledgePacket,
      speakerNpcId: "N-001",
      npcKnowledgeMaxRevealRank: 0,
    })
  );
  assert.ok(report.issues.some((x) => x.code === "root_cause_leak"));
  assert.ok((report.telemetry.npcKnowledgeIssueCount ?? 0) > 0);
});

test("validateNarrative bridges unsupported fact detector", () => {
  const report = validateNarrative(
    baseArgs({
      dmRecord: {
        narrative: "N-001低声说，公寓的根因就是七锚闭环的真相。",
        options: ["退后", "观察", "沉默", "追问"],
        player_location: "B1_SafeZone",
        _narrative_audit: { used_fact_ids: [] },
      },
      allowedFactIds: [NPC_KNOWLEDGE_FACT_IDS.B1_PUBLIC_ANOMALY],
      factDetectionMaxRevealRank: 0,
    })
  );
  assert.ok(report.issues.some((x) => x.code === "unsupported_root_cause_claim"));
  assert.ok((report.telemetry.unsupportedFactIssueCount ?? 0) > 0);
  assert.ok(report.narrativeOverride);
});

test("validateNarrative falls back when root cause has no allowed root fact", () => {
  const report = validateNarrative(
    baseArgs({
      dmRecord: {
        narrative: "我听见N-001低声说，公寓根因就是七锚闭环。",
        options: ["退后", "观察", "沉默", "追问"],
        player_location: "B1_SafeZone",
        _narrative_audit: { used_fact_ids: [] },
      },
      allowedFactIds: [NPC_KNOWLEDGE_FACT_IDS.B1_PUBLIC_ANOMALY],
      factDetectionMaxRevealRank: REVEAL_TIER_RANK.surface,
    })
  );
  assert.ok(report.issues.some((issue) => issue.code === "unsupported_root_cause_claim" && issue.severity === "high"));
  assert.ok(report.narrativeOverride);
});

test("validateNarrative flags relationship claim without fact or edge", () => {
  const npcKnowledgePacket = buildNpcKnowledgePacket({
    speakerNpcId: "N-001",
    presentNpcIds: ["N-001"],
    location: "B1_SafeZone",
    floorId: "B1",
    maxRevealRank: REVEAL_TIER_RANK.surface,
    playerKnownFactIds: [],
    scenePublicFactIds: [],
    activeTaskIds: [],
  });
  const report = validateNarrative(
    baseArgs({
      dmRecord: {
        narrative: "N-001一直保护N-010，这件事早就不是秘密。",
        options: ["退后", "观察", "沉默", "追问"],
        player_location: "B1_SafeZone",
        _narrative_audit: { used_fact_ids: [] },
      },
      npcKnowledgePacket,
      speakerNpcId: "N-001",
      factDetectionMaxRevealRank: REVEAL_TIER_RANK.surface,
    })
  );
  assert.ok(report.issues.some((issue) => issue.code === "unsupported_relationship_claim"));
  assert.ok(report.issues.some((issue) => issue.code === "unsupported_new_fact" && issue.severity === "medium"));
});

test("validateNarrative flags location transition without fact or delta", () => {
  const report = validateNarrative(
    baseArgs({
      dmRecord: {
        narrative: "我已经抵达B2，冷水从门缝漫过来。",
        options: ["退后", "观察", "沉默", "追问"],
        player_location: "B1_SafeZone",
        _narrative_audit: { used_fact_ids: [] },
      },
      delta: { ...emptyStateDelta(), playerLocation: "B1_SafeZone", isActionLegal: true },
      factDetectionMaxRevealRank: REVEAL_TIER_RANK.surface,
    })
  );
  assert.ok(report.issues.some((issue) => issue.code === "unsupported_location_claim" && issue.severity === "medium"));
});

test("validateNarrative maps missing used fact id to medium issue", () => {
  const report = validateNarrative(
    baseArgs({
      dmRecord: {
        narrative: "我继续观察墙根。",
        options: ["退后", "观察", "沉默", "追问"],
        player_location: "B1_SafeZone",
        _narrative_audit: { used_fact_ids: ["fact:missing:ghost"] },
      },
      allowedFactIds: ["fact:missing:ghost"],
      factDetectionMaxRevealRank: REVEAL_TIER_RANK.surface,
    })
  );
  assert.ok(
    report.issues.some((issue) => issue.code === "used_fact_id_missing_from_registry" && issue.severity === "medium")
  );
});

test("validateNarrative maps reveal tier breach fact id to high issue for root fact", () => {
  const report = validateNarrative(
    baseArgs({
      dmRecord: {
        narrative: "我听见N-010说，真正的源头已经逼近。",
        options: ["退后", "观察", "沉默", "追问"],
        player_location: "B1_SafeZone",
        _narrative_audit: { used_fact_ids: [NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_ROOT_TRUTH] },
      },
      allowedFactIds: [NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_ROOT_TRUTH],
      factDetectionMaxRevealRank: REVEAL_TIER_RANK.surface,
    })
  );
  assert.ok(report.issues.some((issue) => issue.code === "fact_id_not_allowed" && issue.severity === "high"));
  assert.ok(report.narrativeOverride);
});

test("validateNarrative records candidate_new_facts without making them committed facts", () => {
  const report = validateNarrative(
    baseArgs({
      dmRecord: {
        narrative: "我没有确认那个人影，只把疑点压在心里。",
        options: ["退后", "观察", "沉默", "追问"],
        player_location: "B1_SafeZone",
        _narrative_audit: {
          used_fact_ids: [],
          candidate_new_facts: [
            {
              text: "老板旁边可能有一个银发女孩",
              category: "npc_identity",
              confidence: 0.2,
              proposed_source: "player_observed",
            },
          ],
        },
      },
      factDetectionMaxRevealRank: REVEAL_TIER_RANK.surface,
    })
  );
  assert.ok(report.issues.some((issue) => issue.code === "unsupported_new_fact" && issue.severity === "low"));
  assert.equal(report.narrativeOverride, null);
});
