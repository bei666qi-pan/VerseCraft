import test from "node:test";
import assert from "node:assert/strict";
import type { ResolvedAiEnv } from "@/lib/ai/config/envCore";
import {
  assertModelAllowedForTask,
  explainTaskRouting,
  getTaskBinding,
  isModelForbiddenForTask,
  resolvePlayerChatMaxTokensForNarrativeBudget,
  resolveFallbackPolicy,
  resolveOrderedRoleChain,
} from "@/lib/ai/tasks/taskPolicy";
import { resolveAiEnv } from "@/lib/ai/config/envCore";

function baseEnv(over: Partial<ResolvedAiEnv> = {}): ResolvedAiEnv {
  const defaults: ResolvedAiEnv = {
    gatewayProvider: "oneapi",
    gatewayBaseUrl: "https://x/v1/chat/completions",
    gatewayApiKey: "k",
    modelsByRole: { main: "m-main", control: "m-control", enhance: "m-enhance", reasoner: "m-reasoner" },
    playerRoleFallbackChain: ["main", "control"],
    memoryPrimaryRole: "main",
    devAssistPrimaryRole: "reasoner",
    defaultTimeoutMs: 60_000,
    maxRetries: 2,
    circuitFailureThreshold: 4,
    circuitCooldownMs: 60_000,
    exposeAiRoutingHeader: false,
    enableStream: true,
    logLevel: "info",
    splitPlayerChatDualSystem: false,
    enableNarrativeEnhancement: false,
    enableNarrativeExpansion: false,
    playerChatStreamIncludeUsage: true,
    playerChatFastLaneRelaxResponseFormat: true,
    playerChatMaxRoleCandidates: 2,
    playerChatMaxRetries: 0,
    playerChatFastLaneTimeoutMs: 18_000,
    playerChatSlowLaneTimeoutMs: 45_000,
    playerChatStreamReconnectWallMs: 22_000,
    playerChatMaxTokensOverride: null,
    onlineShortJsonMaxRetries: 0,
    onlineShortJsonRelaxResponseFormat: true,
    onlineShortJsonDisableMainFallback: true,
    playerChatAggressiveFailover: true,
    playerChatFastLaneZeroRetry: true,
    playerChatFailFastOnAuth: true,
    playerChatFailFastOnRateLimit: true,
    onlineShortJsonRetryHardCap1: true,
    gatewayExtraBody: undefined,
    playerChatExtraBody: undefined,
    controlPreflightBudgetMs: 0,
    narrativeEnhanceBudgetMs: 0,
    streamModerationThrottleMs: 0,
    loreRetrievalBudgetMs: 600,
    offlineFailFast: true,
    offlineAllowMainFallback: false,
    offlineAffectsProviderCircuit: false,
    offlineBudgetProfile: "default",
  };
  return {
    ...defaults,
    ...over,
    modelsByRole: { ...defaults.modelsByRole, ...over.modelsByRole },
  };
}

function withEnv(patch: Record<string, string | undefined>, fn: () => void): void {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(patch)) {
    prev[key] = process.env[key];
    const value = patch[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(patch)) {
      const old = prev[key];
      if (old === undefined) delete process.env[key];
      else process.env[key] = old;
    }
  }
}

test("PLAYER_CHAT primary role is main", () => {
  assert.equal(getTaskBinding("PLAYER_CHAT").primaryRole, "main");
});

test("PLAYER_CHAT maxTokens aligned with short DM JSON budget", () => {
  assert.equal(getTaskBinding("PLAYER_CHAT").maxTokens, 896);
});

test("PLAYER_CHAT narrative budget tiers resolve dynamic maxTokens", () => {
  assert.equal(resolvePlayerChatMaxTokensForNarrativeBudget("micro").maxTokens, 896);
  assert.equal(resolvePlayerChatMaxTokensForNarrativeBudget("short").maxTokens, 1152);
  assert.equal(resolvePlayerChatMaxTokensForNarrativeBudget("standard").maxTokens, 896);
  assert.equal(resolvePlayerChatMaxTokensForNarrativeBudget("reveal").maxTokens, 1792);
  assert.equal(resolvePlayerChatMaxTokensForNarrativeBudget("climax").maxTokens, 1792);
  assert.equal(resolvePlayerChatMaxTokensForNarrativeBudget("ending").maxTokens, 2304);
});

test("PLAYER_CHAT maxTokens env override applies and clamps", () => {
  withEnv({ AI_PLAYER_CHAT_MAX_TOKENS_OVERRIDE: "2048" }, () => {
    const resolved = resolvePlayerChatMaxTokensForNarrativeBudget(
      "micro",
      resolveAiEnv().playerChatMaxTokensOverride
    );
    assert.equal(resolved.maxTokens, 2048);
    assert.equal(resolved.source, "env_override");
    assert.equal(resolved.clamped, false);
  });

  withEnv({ AI_PLAYER_CHAT_MAX_TOKENS_OVERRIDE: "9999" }, () => {
    const resolved = resolvePlayerChatMaxTokensForNarrativeBudget(
      "short",
      resolveAiEnv().playerChatMaxTokensOverride
    );
    assert.equal(resolved.maxTokens, 2304);
    assert.equal(resolved.source, "env_override");
    assert.equal(resolved.clamped, true);
  });

  withEnv({ AI_PLAYER_CHAT_MAX_TOKENS_OVERRIDE: "100" }, () => {
    const resolved = resolvePlayerChatMaxTokensForNarrativeBudget(
      "ending",
      resolveAiEnv().playerChatMaxTokensOverride
    );
    assert.equal(resolved.maxTokens, 896);
    assert.equal(resolved.source, "env_override");
    assert.equal(resolved.clamped, true);
  });
});

test("AI_NARRATIVE_EXPANSION_ENABLED env flag overrides default", () => {
  withEnv({ AI_NARRATIVE_EXPANSION_ENABLED: "false" }, () => {
    assert.equal(resolveAiEnv().enableNarrativeExpansion, false);
  });
  withEnv({ AI_NARRATIVE_EXPANSION_ENABLED: "true" }, () => {
    assert.equal(resolveAiEnv().enableNarrativeExpansion, true);
  });
});

test("reasoner forbidden on PLAYER_CHAT and online control tasks", () => {
  assert.equal(isModelForbiddenForTask("PLAYER_CHAT", "reasoner"), true);
  assert.equal(isModelForbiddenForTask("PLAYER_CONTROL_PREFLIGHT", "reasoner"), true);
  assert.throws(() => assertModelAllowedForTask("PLAYER_CHAT", "reasoner"));
});

test("enhance forbidden on PLAYER_CHAT but allowed on SCENE_ENHANCEMENT", () => {
  assert.equal(isModelForbiddenForTask("PLAYER_CHAT", "enhance"), true);
  assert.equal(isModelForbiddenForTask("SCENE_ENHANCEMENT", "enhance"), false);
});

test("NARRATIVE_EXPANSION uses bounded non-stream json enhance policy", () => {
  const b = getTaskBinding("NARRATIVE_EXPANSION");
  assert.equal(b.primaryRole, "enhance");
  assert.deepEqual(b.fallbackRoles, ["main"]);
  assert.equal(b.stream, false);
  assert.equal(b.maxTokens, 768);
  assert.equal(b.timeoutMs, 7_000);
  assert.equal(b.responseFormatJsonObject, true);
  assert.equal(isModelForbiddenForTask("NARRATIVE_EXPANSION", "reasoner"), true);
});

test("WORLDBUILD_OFFLINE uses reasoner primary and forbids enhance", () => {
  const b = getTaskBinding("WORLDBUILD_OFFLINE");
  assert.equal(b.primaryRole, "reasoner");
  assert.equal(isModelForbiddenForTask("WORLDBUILD_OFFLINE", "enhance"), true);
});

test("DIRECTOR_PLAN_CRITIC is a control gate and never uses reasoner", () => {
  const b = getTaskBinding("DIRECTOR_PLAN_CRITIC");
  assert.equal(b.primaryRole, "control");
  assert.deepEqual(b.fallbackRoles, ["main"]);
  assert.equal(b.stream, false);
  assert.equal(b.responseFormatJsonObject, true);
  assert.equal(isModelForbiddenForTask("DIRECTOR_PLAN_CRITIC", "reasoner"), true);
  assert.equal(isModelForbiddenForTask("DIRECTOR_PLAN_CRITIC", "enhance"), true);
});

test("resolveOrderedRoleChain PLAYER_CHAT merges env extras and filters missing models", () => {
  const onlyMain = baseEnv({
    modelsByRole: { main: "a", control: "", enhance: "", reasoner: "" },
    playerRoleFallbackChain: ["control", "main"],
  });
  const chainMain = resolveOrderedRoleChain("PLAYER_CHAT", onlyMain, "full");
  assert.deepEqual(chainMain, ["main"]);

  const both = baseEnv({
    playerRoleFallbackChain: ["control"],
  });
  const chainBoth = resolveOrderedRoleChain("PLAYER_CHAT", both, "full");
  assert.deepEqual(chainBoth, ["main", "control"]);

  const emerg = baseEnv({ playerRoleFallbackChain: ["control", "reasoner"] });
  const chain = resolveOrderedRoleChain("PLAYER_CHAT", emerg, "emergency");
  assert.deepEqual(chain, ["main"]);

  const full = baseEnv({
    playerRoleFallbackChain: ["control", "main"],
  });
  const fullChain = resolveOrderedRoleChain("PLAYER_CHAT", full, "full");
  assert.ok(fullChain.includes("control"));
  const safe = resolveOrderedRoleChain("PLAYER_CHAT", full, "safe");
  assert.deepEqual(safe, ["main"]);
});

test("resolveFallbackPolicy exposes ordered chain", () => {
  const env = baseEnv({
    playerRoleFallbackChain: ["control", "main"],
  });
  const p = resolveFallbackPolicy("PLAYER_CHAT", env, "full");
  assert.deepEqual(p.chain, ["main", "control"]);
});

test("explainTaskRouting marks missing model config", () => {
  const env = baseEnv({
    modelsByRole: { main: "", control: "c", enhance: "e", reasoner: "r" },
  });
  const lines = explainTaskRouting("PLAYER_CHAT", env, "full");
  const mainLine = lines.find((l) => l.role === "main");
  assert.equal(mainLine?.excluded, true);
  assert.equal(mainLine?.reason, "no_model_config");
});
