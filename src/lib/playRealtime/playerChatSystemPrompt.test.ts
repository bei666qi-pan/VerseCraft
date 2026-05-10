// src/lib/playRealtime/playerChatSystemPrompt.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  __resetStablePlayerDmPrefixMemoForTests,
  buildDynamicPlayerDmSystemSuffix,
  getCompactStablePlayerDmSystemPrefix,
  getStablePlayerDmSystemPrefix,
} from "@/lib/playRealtime/playerChatSystemPrompt";
import { buildNpcConsistencyBoundaryCompactBlock } from "@/lib/playRealtime/npcConsistencyBoundaryPackets";

test("getStablePlayerDmSystemPrefix returns identical string instance for same version key", () => {
  __resetStablePlayerDmPrefixMemoForTests();
  const prev = process.env.VERSECRAFT_DM_STABLE_PROMPT_VERSION;
  process.env.VERSECRAFT_DM_STABLE_PROMPT_VERSION = "unit-test-memo-v1";
  try {
    const a = getStablePlayerDmSystemPrefix();
    const b = getStablePlayerDmSystemPrefix();
    assert.strictEqual(a, b);
  } finally {
    if (prev === undefined) delete process.env.VERSECRAFT_DM_STABLE_PROMPT_VERSION;
    else process.env.VERSECRAFT_DM_STABLE_PROMPT_VERSION = prev;
    __resetStablePlayerDmPrefixMemoForTests();
  }
});

test("compact stable prefix preserves core JSON and safety contract", () => {
  __resetStablePlayerDmPrefixMemoForTests();
  const compact = getCompactStablePlayerDmSystemPrefix();
  const full = getStablePlayerDmSystemPrefix();
  assert.ok(compact.length < full.length);
  assert.ok(compact.includes("请严格以 JSON 格式输出"));
  assert.ok(compact.includes("is_action_legal"));
  assert.ok(compact.includes("sanity_damage"));
  assert.ok(compact.includes("narrative"));
  assert.ok(compact.includes("is_death"));
  assert.ok(compact.includes("options"));
  assert.ok(compact.includes("结构化字段"));
  assert.ok(compact.includes("安全合规"));
});

test("stable prefix 体积已降到可控范围", () => {
  __resetStablePlayerDmPrefixMemoForTests();
  const s = getStablePlayerDmSystemPrefix();
  // 阶段2 + NPC 自然登场过渡规则补入后 stable 体积小幅上升；仍需保持可缓存与可控。
  assert.ok(s.length < 9200, `stable prefix too large: ${s.length}`);
  assert.ok(s.includes("【JSON】单个对象"));
  assert.ok(s.includes("is_action_legal"));
  assert.ok(s.includes("sanity_damage"));
  assert.ok(s.includes("narrative"));
  assert.ok(s.includes("is_death"));
  assert.ok(s.includes("运行时注入事实优先"));
  assert.ok(s.includes("major_npc_arc_packet"));
  assert.ok(s.includes("school_cycle_experience_packet"));
  assert.ok(s.includes("dual-identity"));
  assert.ok(s.includes("no-instant-party"));
  assert.ok(s.includes("reveal-first"));
  assert.ok(s.includes("xinlan-anchor"));
  assert.ok(s.includes("当前对白视角"));
  assert.ok(s.includes("系统知道"));
  assert.ok(s.includes("欣蓝（N-010）"));
  assert.ok(s.includes("第一牵引"));
  assert.ok(s.includes("阶段6·系统咬合"));
  assert.ok(s.includes("matures_to_objective_id"));
  assert.ok(s.includes("NPC 一致性·硬边界"));
  assert.ok(s.includes("阶段5·强制"));
  assert.ok(s.includes("误闯公寓"));
  assert.ok(s.includes("夜读老人"));
  assert.ok(s.includes("快车道若省略运行时 lore JSON"));
  assert.ok(s.includes("actor-*"));
  assert.ok(s.includes("personality/residue/foreshadow"));
  assert.ok(!s.includes("forge_mod_"));
  assert.ok(!s.includes("液态威胁"));
  assert.ok(!s.includes("镜像灌注"));
});

test("stable prefix constrains NPC first encounter and lighter web-novel style", () => {
  __resetStablePlayerDmPrefixMemoForTests();
  const s = getStablePlayerDmSystemPrefix();
  assert.ok(s.includes("中国青春幻想网文"));
  assert.ok(s.includes("恐怖/诡异大幅弱化"));
  assert.ok(s.includes("生活化动作、位置、正在做的事"));
  assert.ok(s.includes("对白可通俗"));
  assert.ok(s.includes("误闯学生/新来的人/需要判断风险的陌生人"));
  assert.ok(s.includes("禁止突兀站着等主角"));
  assert.ok(!s.includes("龙族"));
});

test("dynamic suffix 含 npc_consistency_boundary_compact（快车道亦适用）", () => {
  const boundary = buildNpcConsistencyBoundaryCompactBlock({
    playerContext: "用户位置[1F_Lobby]。NPC当前位置：N-001@1F_Lobby。",
    latestUserInput: "你好",
    playerLocation: "1F_Lobby",
    focusNpcId: "N-001",
    maxRevealRank: 0,
    epistemic: { actorKnownFactCount: 1, publicFactCount: 2, forbiddenFactCount: 3 },
    maxChars: 2000,
  });
  const dyn = buildDynamicPlayerDmSystemSuffix({
    memoryBlock: "## 【actor_epistemic_scoped_packet】\nfocus",
    playerContext: "ctx",
    isFirstAction: false,
    runtimePackets: "",
    controlAugmentation: "",
    npcConsistencyBoundaryBlock: boundary.text,
  });
  assert.ok(dyn.includes("npc_consistency_boundary_compact"));
  assert.ok(dyn.includes('"actor_canon_packet"'));
  assert.ok(dyn.includes('"actor_reveal_limit_packet"'));
  const memIdx = dyn.indexOf("actor_epistemic_scoped_packet");
  const bIdx = dyn.indexOf("npc_consistency_boundary_compact");
  assert.ok(memIdx >= 0 && bIdx > memIdx, "boundary 应紧跟记忆块之后");
});

test("dynamic suffix 传入 narrativeBudgetBlock 时注入 narrative_budget_packet", () => {
  const turnModePolicyBlock = "## 【turn_mode_policy_packet】\n{\"plannedMode\":\"narrative_only\"}";
  const narrativeBudgetBlock =
    "## 【narrative_budget_packet】\n{\"schema\":\"narrative_budget_v1\",\"tier\":\"standard\",\"minChars\":260,\"targetChars\":420,\"maxChars\":520,\"minInfoBeats\":4,\"mustInclude\":[\"承接上一段尾巴\"],\"stopRule\":\"达到目标信息量后停笔，不凑字\",\"reasonCodes\":[\"explore\",\"normal_risk\"]}";
  const narrativeContinuityBlock = "## 【narrative_continuity_packet】\n{\"ok\":true}";
  const dyn = buildDynamicPlayerDmSystemSuffix({
    memoryBlock: "memory",
    playerContext: "ctx",
    isFirstAction: false,
    runtimePackets: "",
    controlAugmentation: "",
    turnModePolicyBlock,
    narrativeBudgetBlock,
    narrativeContinuityBlock,
  });

  assert.ok(dyn.includes("narrative_budget_packet"));
  assert.ok(dyn.includes('"targetChars":420'));
  const turnModeIdx = dyn.indexOf("turn_mode_policy_packet");
  const budgetIdx = dyn.indexOf("narrative_budget_packet");
  const continuityIdx = dyn.indexOf("narrative_continuity_packet");
  assert.ok(turnModeIdx >= 0 && continuityIdx > turnModeIdx, "continuity 应跟在 turn mode / style 后注入");
  assert.ok(budgetIdx >= 0 && budgetIdx > continuityIdx, "budget 保留在治理 runtime packet 后注入");
});

test("dynamic suffix 不传 narrativeBudgetBlock 时保持兼容", () => {
  const dyn = buildDynamicPlayerDmSystemSuffix({
    memoryBlock: "memory",
    playerContext: "ctx",
    isFirstAction: false,
    runtimePackets: "",
    controlAugmentation: "",
  });

  assert.equal(dyn.includes("narrative_budget_packet"), false);
  assert.ok(dyn.includes("ctx"));
});

test("首回合与普通回合都可注入 lore", () => {
  const lore = "【RAG-Lore精简片段】\n- [rule] 示例规则";
  const first = buildDynamicPlayerDmSystemSuffix({
    memoryBlock: "",
    playerContext: "当前位置=1F_Lobby",
    isFirstAction: true,
    runtimePackets: "{\"k\":\"v\"}",
    controlAugmentation: lore,
  });
  const normal = buildDynamicPlayerDmSystemSuffix({
    memoryBlock: "记忆块",
    playerContext: "当前位置=2F_Corridor",
    isFirstAction: false,
    runtimePackets: "{\"k\":\"v\"}",
    controlAugmentation: lore,
  });
  assert.ok(first.includes(lore));
  assert.ok(normal.includes(lore));
  assert.ok(first.includes("首轮承接与行动选项"));
  assert.ok(!normal.includes("开局叙事强制约束"));
});
test("stable prefix keeps concrete narrative budget packet data out of the cacheable section", () => {
  __resetStablePlayerDmPrefixMemoForTests();
  const s = getStablePlayerDmSystemPrefix();
  assert.equal(s.includes('"schema":"narrative_budget_v1"'), false);
  assert.equal(s.includes('"targetChars"'), false);
  assert.equal(s.includes('"reasonCodes"'), false);
});
