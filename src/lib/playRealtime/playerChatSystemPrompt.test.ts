// src/lib/playRealtime/playerChatSystemPrompt.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  __resetStablePlayerDmPrefixMemoForTests,
  buildDynamicPlayerDmSystemSuffix,
  buildStablePlayerDmSystemLines,
  getCompactStablePlayerDmSystemPrefix,
  getStablePlayerDmSystemPrefix,
  shouldUseCompactStablePrompt,
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

test("ordinary RULE turns use compact stable prompt while REVEAL retains full canon", () => {
  const base = { promptSlimmingEnabled: true, compactLanePrompt: false, standardCompactEnabled: true };
  assert.equal(shouldUseCompactStablePrompt({ ...base, turnLane: "RULE" }), true);
  assert.equal(shouldUseCompactStablePrompt({ ...base, turnLane: "REVEAL" }), false);
  assert.equal(shouldUseCompactStablePrompt({ ...base, turnLane: "FAST", compactLanePrompt: true }), true);
  assert.equal(shouldUseCompactStablePrompt({ ...base, turnLane: "RULE", standardCompactEnabled: false }), false);
});

test("stable prefix 体积已降到可控范围", () => {
  __resetStablePlayerDmPrefixMemoForTests();
  const s = getStablePlayerDmSystemPrefix();
  // v6-20260806: major compression — sections enforced by code (resolveDmTurn / validateNarrative /
  // commitTurn / b1Safety / actorEpistemicFilter / post-generation validators / dynamic packets)
  // removed from stable prompt. Target ~4,500 chars, upper bound 6,000.
  assert.ok(s.length < 6000, `stable prefix too large: ${s.length}`);
  // 平台身份与核心规则
  assert.ok(s.includes("is_action_legal"));
  assert.ok(s.includes("sanity_damage"));
  assert.ok(s.includes("narrative"));
  assert.ok(s.includes("运行时注入优先"));
  // 保留的核心段
  assert.ok(s.includes("dual-identity"));
  assert.ok(s.includes("xinlan-anchor"));
  assert.ok(s.includes("NPC一致性·硬边界"));
  assert.ok(s.includes("欣蓝（N-010）"));
  assert.ok(s.includes("昼夜"));
  assert.ok(s.includes("承接玩家输入"));
  assert.ok(s.includes("POV·第一人称硬约束"));
  assert.ok(s.includes("任务三要素"));
  assert.ok(s.includes("NPC 回合状态"));
  // 不应包含已被代码强制的内容
  assert.ok(!s.includes("阶段6·系统咬合"));
  assert.ok(!s.includes("matures_to_objective_id"));
  assert.ok(!s.includes("major_npc_arc_packet"));
  assert.ok(!s.includes("【JSON】单个对象"));
  assert.ok(!s.includes("actor-*"));
  assert.ok(!s.includes("规范名册"));
  assert.ok(!s.includes("lowCharmNpcPacket"));
  assert.ok(!s.includes("forge_mod_"));
  assert.ok(!s.includes("液态威胁"));
  assert.ok(!s.includes("镜像灌注"));
});

test("stable prefix constrains NPC natural entrance and cinematic literary style", () => {
  __resetStablePlayerDmPrefixMemoForTests();
  const s = getStablePlayerDmSystemPrefix();
  // 文风与四拍已由风格指导 packet 动态注入，stable 仅保留平台身份中的核心文风描述
  assert.ok(s.includes("长短句交替"));
  // NPC 回合状态 packet 替代了原有的硬编码规则
  assert.ok(s.includes("按 npc_turn_state packet 执行"));
  // 不应包含已移除的内容
  assert.ok(!s.includes("四拍组织"));
  assert.ok(!s.includes("龙族"));
  assert.ok(!s.includes("江南"));
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
  const narrativeBudgetBlock =
    "## 【narrative_budget_packet】\n{\"schema\":\"narrative_budget_v1\",\"tier\":\"standard\",\"minChars\":260,\"targetChars\":420,\"maxChars\":520,\"minInfoBeats\":4,\"mustInclude\":[\"承接上一段尾巴\"],\"stopRule\":\"达到目标信息量后停笔，不凑字\",\"reasonCodes\":[\"explore\",\"normal_risk\"]}";
  const narrativeContinuityBlock = "## 【narrative_continuity_packet】\n{\"ok\":true}";
  const dyn = buildDynamicPlayerDmSystemSuffix({
    memoryBlock: "memory",
    playerContext: "ctx",
    isFirstAction: false,
    runtimePackets: "",
    controlAugmentation: "",
    narrativeBudgetBlock,
    narrativeContinuityBlock,
  });

  assert.ok(dyn.includes("narrative_budget_packet"));
  assert.ok(dyn.includes('"targetChars":420'));
  const budgetIdx = dyn.indexOf("narrative_budget_packet");
  const continuityIdx = dyn.indexOf("narrative_continuity_packet");
  assert.ok(budgetIdx >= 0 && budgetIdx > continuityIdx, "budget 应在 continuity 之后注入（runtime packet 区域）");
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

test("dynamic suffix gives the selected response-language instruction first and final priority", () => {
  const suffix = buildDynamicPlayerDmSystemSuffix({
    languageInstruction: "[Response language] English only.",
    memoryBlock: "memory",
    playerContext: "context",
    isFirstAction: false,
    runtimePackets: "runtime",
    controlAugmentation: "",
  });
  assert.ok(suffix.startsWith("[Response language] English only."));
  assert.ok(suffix.endsWith("[Response language] English only."));
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

test("English first turn uses an English continuation constraint", () => {
  const suffix = buildDynamicPlayerDmSystemSuffix({
    languageInstruction: "[Response language] English only.",
    memoryBlock: "",
    playerContext: "ctx",
    isFirstAction: true,
    runtimePackets: "",
    controlAugmentation: "",
  });
  assert.ok(suffix.includes("[First-turn continuation and actions]"));
  assert.equal(suffix.includes("【首轮承接与行动选项"), false);
});
test("stable prefix keeps concrete narrative budget packet data out of the cacheable section", () => {
  __resetStablePlayerDmPrefixMemoForTests();
  const s = getStablePlayerDmSystemPrefix();
  assert.equal(s.includes('"schema":"narrative_budget_v1"'), false);
  assert.equal(s.includes('"targetChars"'), false);
  assert.equal(s.includes('"reasonCodes"'), false);
});

import { assemblePlayerChatPrompt } from "@/lib/turnEngine/promptAssembly";

const STABLE_SECTION_GLUE = "\n\n## 【本回合动态上下文】";

test("benchmark: assemblePlayerChatPrompt cache impact — 100 iterations", () => {
  __resetStablePlayerDmPrefixMemoForTests();

  const messagesToSend = [
    { role: "user" as const, content: "我沿着走廊继续前进，留意四周的动静。" },
  ];
  const dynamicSuffix =
    "【动态上下文】\n当前玩家状态：位置=3F_Corridor | 理智=85 | 生命=100\nruntimePackets: {}";

  // Pre-compute prefix string for content verification
  const rebuiltPrefix = buildStablePlayerDmSystemLines().join("\n") + STABLE_SECTION_GLUE;
  const cachedPrefix = getStablePlayerDmSystemPrefix();

  // Verify cached and rebuilt prefixes are equivalent (content, not identity)
  assert.equal(
    cachedPrefix,
    rebuiltPrefix,
    "cached and rebuilt stable prefixes should be content-equal"
  );

  // Verify the cached result returns the same object reference (identity stability)
  const a = getStablePlayerDmSystemPrefix();
  const b = getStablePlayerDmSystemPrefix();
  assert.strictEqual(a, b, "cached prefix should return identical object reference");

  // --- with cache: use pre-computed module-level prefix ---
  // Total batch time avoids per-iteration performance.now() overhead
  const tCached0 = performance.now();
  for (let i = 0; i < 100; i += 1) {
    const stablePrefix = getStablePlayerDmSystemPrefix();
    assemblePlayerChatPrompt({
      stablePrefix,
      dynamicSuffix,
      splitDualSystem: false,
      messagesToSend,
    });
  }
  const tCached1 = performance.now();

  // --- without cache: rebuild prefix from scratch each iteration ---
  // Each iteration: clear LRU cache + rebuild via buildStablePlayerDmSystemLines()
  // (~175-line array allocation + join, ~10 KB string). This is the cost the
  // module-level _STABLE_PREFIX_VALUE constant avoids on every turn.
  const tUncached0 = performance.now();
  for (let i = 0; i < 100; i += 1) {
    __resetStablePlayerDmPrefixMemoForTests();
    const stablePrefix = buildStablePlayerDmSystemLines().join("\n") + STABLE_SECTION_GLUE;
    assemblePlayerChatPrompt({
      stablePrefix,
      dynamicSuffix,
      splitDualSystem: false,
      messagesToSend,
    });
  }
  const tUncached1 = performance.now();

  const cachedTotal = tCached1 - tCached0;
  const uncachedTotal = tUncached1 - tUncached0;
  const cachedAvg = cachedTotal / 100;
  const uncachedAvg = uncachedTotal / 100;
  const timeSavedAvg = uncachedAvg - cachedAvg;

  // --- output ---
  console.log("=== Prompt Cache Benchmark (assemblePlayerChatPrompt × 100) ===");
  console.log(`Stable prefix: ${cachedPrefix.length} chars (~${Math.ceil(cachedPrefix.length / 4)} tokens)`);
  console.log(`With cache    avg: ${cachedAvg.toFixed(4)}ms   total: ${cachedTotal.toFixed(3)}ms (100 calls)`);
  console.log(`Without cache avg: ${uncachedAvg.toFixed(4)}ms   total: ${uncachedTotal.toFixed(3)}ms (100 calls)`);
  console.log(`Time saved    avg: ${timeSavedAvg.toFixed(4)}ms   total: ${(uncachedTotal - cachedTotal).toFixed(4)}ms`);
  if (timeSavedAvg > 0) {
    console.log(`Speedup: ${(uncachedAvg / Math.max(cachedAvg, 0.0001)).toFixed(1)}×`);
  }

  // Verify both paths produce equivalent assemble results
  const withCacheResult = assemblePlayerChatPrompt({
    stablePrefix: cachedPrefix,
    dynamicSuffix,
    splitDualSystem: false,
    messagesToSend,
  });
  const withoutCacheResult = assemblePlayerChatPrompt({
    stablePrefix: rebuiltPrefix,
    dynamicSuffix,
    splitDualSystem: false,
    messagesToSend,
  });
  assert.equal(
    withCacheResult.promptStablePrefixHash,
    withoutCacheResult.promptStablePrefixHash,
    "hash should be identical for equivalent prefixes"
  );
  assert.equal(withCacheResult.stableCharLen, withoutCacheResult.stableCharLen);
  assert.equal(withCacheResult.dynamicCharLen, withoutCacheResult.dynamicCharLen);

  // Cleanup
  __resetStablePlayerDmPrefixMemoForTests();
});
