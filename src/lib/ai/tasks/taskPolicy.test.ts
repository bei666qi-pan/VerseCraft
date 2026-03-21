// src/lib/ai/tasks/taskPolicy.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import type { ResolvedAiEnv } from "@/lib/ai/config/envCore";
import {
  assertModelAllowedForTask,
  explainTaskRouting,
  getTaskBinding,
  isModelForbiddenForTask,
  resolveFallbackPolicy,
  resolveOrderedModelChain,
  TASK_POLICY,
} from "@/lib/ai/tasks/taskPolicy";

function baseEnv(over: Partial<ResolvedAiEnv> = {}): ResolvedAiEnv {
  return {
    deepseek: {
      apiUrl: "https://api.deepseek.com/chat/completions",
      apiKey: over.deepseek?.apiKey ?? "ds",
      defaultModel: "deepseek-v3.2",
    },
    zhipu: {
      apiUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      apiKey: over.zhipu?.apiKey ?? "zp",
      defaultModel: "glm-5-air",
    },
    minimax: {
      apiUrl: "https://api.minimax.io/v1/text/chatcompletion_v2",
      apiKey: over.minimax?.apiKey ?? "",
      defaultModel: "MiniMax-M2.7-highspeed",
    },
    playerChatFallbackChain: over.playerChatFallbackChain ?? ["deepseek-v3.2", "glm-5-air"],
    memoryCompressionModel: over.memoryCompressionModel ?? "deepseek-v3.2",
    adminInsightModel: over.adminInsightModel ?? "deepseek-reasoner",
    defaultTimeoutMs: 60_000,
    maxRetries: 2,
    circuitFailureThreshold: 4,
    circuitCooldownMs: 60_000,
    exposeAiRoutingHeader: false,
    ...over,
  };
}

test("PLAYER_CHAT primary is deepseek-v3.2", () => {
  assert.equal(getTaskBinding("PLAYER_CHAT").primaryModel, "deepseek-v3.2");
});

test("deepseek-reasoner forbidden on PLAYER_CHAT and online control tasks", () => {
  assert.equal(isModelForbiddenForTask("PLAYER_CHAT", "deepseek-reasoner"), true);
  assert.equal(isModelForbiddenForTask("PLAYER_CONTROL_PREFLIGHT", "deepseek-reasoner"), true);
  assert.throws(() => assertModelAllowedForTask("PLAYER_CHAT", "deepseek-reasoner"));
});

test("MiniMax forbidden on PLAYER_CHAT but allowed on SCENE_ENHANCEMENT", () => {
  assert.equal(isModelForbiddenForTask("PLAYER_CHAT", "MiniMax-M2.7-highspeed"), true);
  assert.equal(isModelForbiddenForTask("SCENE_ENHANCEMENT", "MiniMax-M2.7-highspeed"), false);
});

test("WORLDBUILD_OFFLINE uses reasoner primary and forbids MiniMax", () => {
  const b = getTaskBinding("WORLDBUILD_OFFLINE");
  assert.equal(b.primaryModel, "deepseek-reasoner");
  assert.equal(isModelForbiddenForTask("WORLDBUILD_OFFLINE", "MiniMax-M2.7-highspeed"), true);
});

test("resolveOrderedModelChain PLAYER_CHAT merges env extras and filters keys", () => {
  const onlyDs = baseEnv({ zhipu: { apiUrl: "", apiKey: "", defaultModel: "glm-5-air" } });
  const chainDs = resolveOrderedModelChain("PLAYER_CHAT", onlyDs, "full");
  assert.deepEqual(chainDs, ["deepseek-v3.2"]);

  const both = baseEnv();
  const chainBoth = resolveOrderedModelChain("PLAYER_CHAT", both, "full");
  assert.deepEqual(chainBoth, ["deepseek-v3.2", "glm-5-air"]);
});

test("emergency mode collapses PLAYER_CHAT to V3.2 only when key exists", () => {
  const env = baseEnv();
  const chain = resolveOrderedModelChain("PLAYER_CHAT", env, "emergency");
  assert.deepEqual(chain, ["deepseek-v3.2"]);
});

test("safe mode does not append AI_PLAYER_MODEL_CHAIN extras beyond policy", () => {
  const env = baseEnv({
    playerChatFallbackChain: ["glm-5-air", "deepseek-v3.2"],
  });
  const full = resolveOrderedModelChain("PLAYER_CHAT", env, "full");
  assert.ok(full.includes("glm-5-air"));
  const safe = resolveOrderedModelChain("PLAYER_CHAT", env, "safe");
  assert.deepEqual(safe, ["deepseek-v3.2"]);
});

test("resolveFallbackPolicy mirrors ordered chain contract", () => {
  const p = resolveFallbackPolicy("INTENT_PARSE", baseEnv(), "full");
  assert.equal(p.stopOnFirstSuccess, true);
  assert.equal(p.tripCircuitOnFailure, true);
  assert.deepEqual(p.chain, ["glm-5-air", "deepseek-v3.2"]);
});

test("explainTaskRouting marks forbidden and missing keys", () => {
  const env = baseEnv({
    deepseek: { apiUrl: "", apiKey: "", defaultModel: "deepseek-v3.2" },
    zhipu: { apiUrl: "", apiKey: "z", defaultModel: "glm-5-air" },
  });
  const lines = explainTaskRouting("PLAYER_CHAT", env, "safe");
  const v32 = lines.find((l) => l.model === "deepseek-v3.2");
  assert.equal(v32?.excluded, true);
  assert.equal(v32?.reason, "no_api_key");
});

test("TASK_POLICY entries stay JSON-mode aligned for structured tasks", () => {
  for (const t of Object.keys(TASK_POLICY) as Array<keyof typeof TASK_POLICY>) {
    const b = TASK_POLICY[t];
    if (b.task === "SCENE_ENHANCEMENT" || b.task === "NPC_EMOTION_POLISH") {
      assert.equal(b.responseFormatJsonObject, false);
    } else {
      assert.equal(b.responseFormatJsonObject, true);
    }
  }
});
