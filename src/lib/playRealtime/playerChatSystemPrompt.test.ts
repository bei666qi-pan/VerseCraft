// src/lib/playRealtime/playerChatSystemPrompt.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  __resetStablePlayerDmPrefixMemoForTests,
  buildDynamicPlayerDmSystemSuffix,
  getStablePlayerDmSystemPrefix,
} from "@/lib/playRealtime/playerChatSystemPrompt";

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
  assert.ok(s.length < 12000, `stable prefix too large: ${s.length}`);
  assert.ok(s.includes("【JSON】单个对象"));
  assert.ok(s.includes("is_action_legal"));
  assert.ok(s.includes("sanity_damage"));
  assert.ok(s.includes("narrative"));
  assert.ok(s.includes("is_death"));
});

test("首回合与普通回合都可注入 lore", () => {
  const lore = "【RAG-Lore精简片段】\n- [rule] 示例规则";
  const first = buildDynamicPlayerDmSystemSuffix({
    memoryBlock: "",
    playerContext: "当前位置=1F_Lobby",
    isFirstAction: true,
    controlAugmentation: lore,
  });
  const normal = buildDynamicPlayerDmSystemSuffix({
    memoryBlock: "记忆块",
    playerContext: "当前位置=2F_Corridor",
    isFirstAction: false,
    controlAugmentation: lore,
  });
  assert.ok(first.includes(lore));
  assert.ok(normal.includes(lore));
  assert.ok(first.includes("开局叙事强制约束"));
  assert.ok(!normal.includes("开局叙事强制约束"));
});
