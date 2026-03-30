// src/lib/playRealtime/playerChatSystemPrompt.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  __resetStablePlayerDmPrefixMemoForTests,
  buildDynamicPlayerDmSystemSuffix,
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

test("stable prefix 体积已降到可控范围", () => {
  __resetStablePlayerDmPrefixMemoForTests();
  const s = getStablePlayerDmSystemPrefix();
  assert.ok(s.length < 8000, `stable prefix too large: ${s.length}`);
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
  assert.ok(first.includes("开局叙事强制约束"));
  assert.ok(!normal.includes("开局叙事强制约束"));
});
