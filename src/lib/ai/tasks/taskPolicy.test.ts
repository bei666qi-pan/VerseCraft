import test from "node:test";
import assert from "node:assert/strict";
import type { ResolvedAiEnv } from "@/lib/ai/config/envCore";
import {
  assertModelAllowedForTask,
  explainTaskRouting,
  getTaskBinding,
  isModelForbiddenForTask,
  resolveFallbackPolicy,
  resolveOrderedRoleChain,
} from "@/lib/ai/tasks/taskPolicy";

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
  };
  return {
    ...defaults,
    ...over,
    modelsByRole: { ...defaults.modelsByRole, ...over.modelsByRole },
  };
}

test("PLAYER_CHAT primary role is main", () => {
  assert.equal(getTaskBinding("PLAYER_CHAT").primaryRole, "main");
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

test("WORLDBUILD_OFFLINE uses reasoner primary and forbids enhance", () => {
  const b = getTaskBinding("WORLDBUILD_OFFLINE");
  assert.equal(b.primaryRole, "reasoner");
  assert.equal(isModelForbiddenForTask("WORLDBUILD_OFFLINE", "enhance"), true);
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
