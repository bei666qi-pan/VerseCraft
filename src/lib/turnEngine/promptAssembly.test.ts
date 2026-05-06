import test from "node:test";
import assert from "node:assert/strict";
import { assemblePlayerChatPrompt } from "@/lib/turnEngine/promptAssembly";

test("assemblePlayerChatPrompt keeps stable prefix before dynamic context for prompt caching", () => {
  const stablePrefix = "STABLE_PREFIX_EXACT";
  const dynamicSuffix = "DYNAMIC_CONTEXT";
  const out = assemblePlayerChatPrompt({
    stablePrefix,
    dynamicSuffix,
    splitDualSystem: false,
    messagesToSend: [{ role: "user", content: "player action" }],
  });
  const system = out.safeMessages[0];
  assert.equal(system.role, "system");
  assert.equal(system.content.indexOf(stablePrefix), 0);
  assert.ok(system.content.indexOf(dynamicSuffix) > stablePrefix.length);
  assert.equal(out.stableCharLen, stablePrefix.length);
  assert.equal(out.dynamicCharLen, dynamicSuffix.length);
  assert.ok(out.promptStablePrefixHash.length >= 8);
  assert.ok(out.stableTokenEstimate > 0);
});

test("assemblePlayerChatPrompt split mode keeps stable system message first", () => {
  const out = assemblePlayerChatPrompt({
    stablePrefix: "STABLE_A",
    dynamicSuffix: "DYNAMIC_B",
    splitDualSystem: true,
    messagesToSend: [{ role: "user", content: "player action" }],
  });
  assert.equal(out.safeMessages[0]?.role, "system");
  assert.equal(out.safeMessages[0]?.content, "STABLE_A");
  assert.equal(out.safeMessages[1]?.role, "system");
  assert.equal(out.safeMessages[1]?.content, "DYNAMIC_B");
  assert.notEqual(
    assemblePlayerChatPrompt({
      stablePrefix: "STABLE_A_CHANGED",
      dynamicSuffix: "DYNAMIC_B",
      splitDualSystem: true,
      messagesToSend: [],
    }).promptStablePrefixHash,
    out.promptStablePrefixHash
  );
});
