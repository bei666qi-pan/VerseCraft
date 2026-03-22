// src/lib/playRealtime/playerChatSystemPrompt.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  __resetStablePlayerDmPrefixMemoForTests,
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
