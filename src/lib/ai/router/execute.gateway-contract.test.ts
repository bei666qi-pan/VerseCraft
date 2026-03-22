/**
 * 网关契约：错误聚合、环境切换对请求体的影响（无真实 one-api、无扣费）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { resetProviderCircuitsForTests } from "@/lib/ai/fallback/circuitBreaker";
import { resetModelCircuitsForTests } from "@/lib/ai/fallback/modelCircuit";
import type { ChatMessage } from "@/lib/ai/types/core";
import { executeChatCompletion, executePlayerChatStream } from "@/lib/ai/router/execute";

function patchEnv(updates: Record<string, string | undefined>): () => void {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(updates)) {
    prev[k] = process.env[k];
    const v = updates[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return () => {
    for (const k of Object.keys(updates)) {
      const o = prev[k];
      if (o === undefined) delete process.env[k];
      else process.env[k] = o;
    }
  };
}

const baseGateway = {
  AI_GATEWAY_BASE_URL: "https://gw.contract.test",
  AI_GATEWAY_API_KEY: "k",
  AI_MODEL_MAIN: "model-main",
  AI_MODEL_CONTROL: "model-control",
  AI_MODEL_ENHANCE: "model-enhance",
  AI_MODEL_REASONER: "model-reasoner",
  AI_PLAYER_ROLE_CHAIN: "main,control",
  AI_MAX_RETRIES: "0",
  AI_TIMEOUT_MS: "5000",
  AI_CIRCUIT_FAILURE_THRESHOLD: "99",
};

test("executePlayerChatStream CHAIN_EXHAUSTED after all roles return 5xx", async (t) => {
  const restore = patchEnv(baseGateway);
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.ok(String(input).includes("gw.contract.test"));
    const body = JSON.parse(String(init?.body)) as { model?: string };
    assert.ok(body.model === "model-main" || body.model === "model-control");
    return new Response("err", { status: 503 });
  };
  t.after(() => {
    globalThis.fetch = origFetch;
    restore();
    resetModelCircuitsForTests();
    resetProviderCircuitsForTests();
  });
  resetModelCircuitsForTests();
  resetProviderCircuitsForTests();

  const messages: ChatMessage[] = [{ role: "user", content: "hi" }];
  const result = await executePlayerChatStream({
    messages,
    ctx: { requestId: "gw-contract-1", task: "PLAYER_CHAT", userId: null },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "CHAIN_EXHAUSTED");
  assert.match(result.message, /失败|重试|检查/);
});

test("executeChatCompletion CHAIN_EXHAUSTED for RULE_RESOLUTION when upstream always errors", async (t) => {
  const restore = patchEnv(baseGateway);
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("bad", { status: 502 });
  t.after(() => {
    globalThis.fetch = origFetch;
    restore();
    resetModelCircuitsForTests();
    resetProviderCircuitsForTests();
  });
  resetModelCircuitsForTests();
  resetProviderCircuitsForTests();

  const res = await executeChatCompletion({
    task: "RULE_RESOLUTION",
    messages: [{ role: "user", content: "{}" }],
    ctx: { requestId: "gw-contract-2", task: "RULE_RESOLUTION" },
  });
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.code, "CHAIN_EXHAUSTED");
  assert.ok(res.routing?.attempts && res.routing.attempts.length >= 1);
});

test("first player stream hop uses AI_MODEL_MAIN from env", async (t) => {
  const restore = patchEnv({
    ...baseGateway,
    AI_MODEL_MAIN: "vc-custom-main",
  });
  const origFetch = globalThis.fetch;
  let firstModel = "";
  let n = 0;
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    n++;
    const body = JSON.parse(String(init?.body)) as { model?: string };
    if (n === 1) firstModel = body.model ?? "";
    return new Response("x", { status: 503 });
  };
  t.after(() => {
    globalThis.fetch = origFetch;
    restore();
    resetModelCircuitsForTests();
    resetProviderCircuitsForTests();
  });
  resetModelCircuitsForTests();
  resetProviderCircuitsForTests();

  await executePlayerChatStream({
    messages: [{ role: "user", content: "x" }],
    ctx: { requestId: "gw-contract-3", task: "PLAYER_CHAT", userId: null },
  });
  assert.equal(firstModel, "vc-custom-main");
});

test("local vs production style base URL both normalize to chat completions path", async () => {
  const { resolveAiEnv } = await import("@/lib/ai/config/envCore");
  const restoreA = patchEnv({
    AI_GATEWAY_BASE_URL: "http://127.0.0.1:8080",
    AI_GATEWAY_API_KEY: "x",
    AI_MODEL_MAIN: "m",
    AI_MODEL_CONTROL: "c",
    AI_MODEL_ENHANCE: "e",
    AI_MODEL_REASONER: "r",
  });
  try {
    assert.match(resolveAiEnv().gatewayBaseUrl, /\/v1\/chat\/completions$/);
  } finally {
    restoreA();
  }
  const restoreB = patchEnv({
    AI_GATEWAY_BASE_URL: "https://coolify-prod.example/v1/chat/completions",
    AI_GATEWAY_API_KEY: "x",
    AI_MODEL_MAIN: "m",
    AI_MODEL_CONTROL: "c",
    AI_MODEL_ENHANCE: "e",
    AI_MODEL_REASONER: "r",
  });
  try {
    assert.equal(
      resolveAiEnv().gatewayBaseUrl,
      "https://coolify-prod.example/v1/chat/completions"
    );
  } finally {
    restoreB();
  }
});
