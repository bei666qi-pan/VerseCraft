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
      rejectedReasons: {
        player_private_locked_to_player: 0,
        dm_only_world_truth: 0,
        other_npc_private_memory: 0,
        scope_shared_scene_ok_to_infer: 0,
        scope_public_ok: 0,
        actor_owned_private: 0,
        player_actor_owns_fact: 0,
        reveal_tier_below_threshold: 0,
        xinlan_exception_not_propagated: 0,
        expired_fact_dropped: 0,
      },
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
      rejectedReasons: {
        player_private_locked_to_player: 0,
        dm_only_world_truth: 0,
        other_npc_private_memory: 0,
        scope_shared_scene_ok_to_infer: 0,
        scope_public_ok: 0,
        actor_owned_private: 0,
        player_actor_owns_fact: 0,
        reveal_tier_below_threshold: 0,
        xinlan_exception_not_propagated: 0,
        expired_fact_dropped: 0,
      },
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
  assert.ok(report.optionsOverride, "medium severity options issue proposes override");
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
  assert.ok(report.optionsOverride);
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
