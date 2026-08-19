/**
 * 网关契约：错误聚合、环境切换对请求体的影响（无真实 one-api、无扣费）。
 */
// These tests stub global fetch with fake hosts; the HTTP/1.1 gateway
// transport (AI_GATEWAY_FORCE_HTTP1) would bypass the stub with real DNS.
process.env.AI_UPSTREAM_FORCE_HTTP1 = "0";
import test from "node:test";
import assert from "node:assert/strict";
import { resetProviderCircuitsForTests } from "@/lib/ai/fallback/circuitBreaker";
import { resetModelCircuitsForTests } from "@/lib/ai/fallback/modelCircuit";
import type { ChatMessage } from "@/lib/ai/types/core";
import { executeChatCompletion, executePlayerChatStream } from "@/lib/ai/router/execute";
import { installManagedAiTestSnapshotFromEnv } from "@/lib/ai/managed/testFixtures";
import { getManagedBindingsForTask } from "@/lib/ai/managed/state";

// Kimi Code CLI 运行时注入的环境变量。测试期间需清除。
const KIMI_INJECTED_VARS = [
  "VC_AI_DIRECT_BASE_URL",
  "VC_AI_DIRECT_API_KEY",
  "VC_AI_DIRECT_MODEL",
  "VC_AI_DIRECT_MODEL_MAIN",
  "VC_AI_DIRECT_MODEL_CONTROL",
  "VC_AI_DIRECT_MODEL_ENHANCE",
  "VC_AI_DIRECT_MODEL_REASONER",
  "VC_AI_DIRECT_PLAYER_MODEL",
  "KIMI_MODEL_PROVIDER_TYPE",
  "KIMI_MODEL_BASE_URL",
  "KIMI_MODEL_API_KEY",
  "KIMI_MODEL_NAME",
];

function patchEnv(updates: Record<string, string | undefined>): () => void {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(updates)) {
    prev[k] = process.env[k];
    const v = updates[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  // 清除 Kimi 注入变量
  for (const k of KIMI_INJECTED_VARS) {
    if (!(k in updates)) {
      prev[k] = process.env[k];
      delete process.env[k];
    }
  }
  const restoreSnapshot = installManagedAiTestSnapshotFromEnv();
  return () => {
    restoreSnapshot();
    for (const k of Object.keys(updates)) {
      const o = prev[k];
      if (o === undefined) delete process.env[k];
      else process.env[k] = o;
    }
    for (const k of KIMI_INJECTED_VARS) {
      if (!(k in updates)) {
        const o = prev[k];
        if (o === undefined) delete process.env[k];
        else process.env[k] = o;
      }
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
  let callCount = 0;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    callCount++;
    assert.ok(String(input).includes("gw.contract.test"));
    const body = JSON.parse(String(init?.body)) as { model?: string };
    if (callCount === 1) assert.equal(body.model, "model-main");
    else if (callCount === 2) assert.equal(body.model, "model-control");
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
  assert.equal(res.routing?.attempts?.length, 2);
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

test("executePlayerChatStream omits max_tokens even when a legacy override is supplied", async (t) => {
  const restore = patchEnv(baseGateway);
  const origFetch = globalThis.fetch;
  let maxTokens: number | undefined;
  let responseFormatType = "";
  let streamEnabled = false;
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      max_tokens?: number;
      response_format?: { type?: string };
      stream?: boolean;
    };
    maxTokens = body.max_tokens;
    responseFormatType = body.response_format?.type ?? "";
    streamEnabled = body.stream === true;
    const stream = new ReadableStream({
      start(controller) {
        controller.close();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  };
  t.after(() => {
    globalThis.fetch = origFetch;
    restore();
    resetModelCircuitsForTests();
    resetProviderCircuitsForTests();
  });
  resetModelCircuitsForTests();
  resetProviderCircuitsForTests();

  const result = await executePlayerChatStream({
    messages: [{ role: "user", content: "x" }],
    ctx: { requestId: "gw-contract-max-tokens-player", task: "PLAYER_CHAT", userId: null },
    maxTokensOverride: 9999,
  });

  assert.equal(result.ok, true);
  assert.equal(maxTokens, undefined);
  assert.equal(responseFormatType, "json_object");
  assert.equal(streamEnabled, true);
});

test("legacy 896 PLAYER_CHAT override cannot reintroduce a wire-level cap", async (t) => {
  const restore = patchEnv(baseGateway);
  const origFetch = globalThis.fetch;
  let maxTokens: number | undefined;
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { max_tokens?: number };
    maxTokens = body.max_tokens;
    return new Response(new ReadableStream({ start(controller) { controller.close(); } }), {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  };
  t.after(() => {
    globalThis.fetch = origFetch;
    restore();
    resetModelCircuitsForTests();
    resetProviderCircuitsForTests();
  });

  const result = await executePlayerChatStream({
    messages: [{ role: "user", content: "x" }],
    ctx: { requestId: "gw-contract-min-tokens-player", task: "PLAYER_CHAT", userId: null },
    maxTokensOverride: 896,
  });

  assert.equal(result.ok, true);
  assert.equal(maxTokens, undefined);
});

test("AI_PLAYER_CHAT_MAX_TOKENS_OVERRIDE does not affect non PLAYER_CHAT completion tasks", async (t) => {
  const restore = patchEnv({
    ...baseGateway,
    AI_PLAYER_CHAT_MAX_TOKENS_OVERRIDE: "2304",
  });
  const origFetch = globalThis.fetch;
  let maxTokens: number | undefined;
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { max_tokens?: number };
    maxTokens = body.max_tokens;
    return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  t.after(() => {
    globalThis.fetch = origFetch;
    restore();
    resetModelCircuitsForTests();
    resetProviderCircuitsForTests();
  });
  resetModelCircuitsForTests();
  resetProviderCircuitsForTests();

  const res = await executeChatCompletion({
    task: "INTENT_PARSE",
    messages: [{ role: "user", content: "{}" }],
    ctx: { requestId: "gw-contract-max-tokens-non-player", task: "INTENT_PARSE" },
  });

  assert.equal(res.ok, true);
  assert.equal(maxTokens, undefined);
});

test("executeChatCompletion honors explicit JSON response override for online short JSON tasks", async (t) => {
  const restore = patchEnv({
    ...baseGateway,
    AI_ONLINE_SHORT_JSON_RELAX_RESPONSE_FORMAT: "1",
  });
  const origFetch = globalThis.fetch;
  let responseFormatType = "";
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      response_format?: { type?: string };
    };
    responseFormatType = body.response_format?.type ?? "";
    return new Response(JSON.stringify({ choices: [{ message: { content: "{\"options\":[\"a\",\"b\",\"c\",\"d\"]}" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  t.after(() => {
    globalThis.fetch = origFetch;
    restore();
    resetModelCircuitsForTests();
    resetProviderCircuitsForTests();
  });
  resetModelCircuitsForTests();
  resetProviderCircuitsForTests();

  const res = await executeChatCompletion({
    task: "INTENT_PARSE",
    messages: [{ role: "user", content: "{}" }],
    ctx: { requestId: "gw-contract-force-json-short-task", task: "INTENT_PARSE" },
    devOverrides: { responseFormatJsonObject: true },
    skipCache: true,
  });

  assert.equal(res.ok, true);
  assert.equal(responseFormatType, "json_object");
});

test("executeChatCompletion requests JSON object by default for control-plane tasks", async (t) => {
  const restore = patchEnv({ ...baseGateway, AI_ONLINE_SHORT_JSON_RELAX_RESPONSE_FORMAT: undefined });
  const origFetch = globalThis.fetch;
  let responseFormatType = "";
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { response_format?: { type?: string } };
    responseFormatType = body.response_format?.type ?? "";
    return new Response(JSON.stringify({ choices: [{ message: { content: "{\"intent\":\"explore\"}" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  t.after(() => {
    globalThis.fetch = origFetch;
    restore();
    resetModelCircuitsForTests();
    resetProviderCircuitsForTests();
  });
  resetModelCircuitsForTests();
  resetProviderCircuitsForTests();

  const result = await executeChatCompletion({
    task: "PLAYER_CONTROL_PREFLIGHT",
    messages: [{ role: "user", content: "观察四周" }],
    ctx: { requestId: "gw-contract-control-json-default", task: "PLAYER_CONTROL_PREFLIGHT" },
    skipCache: true,
  });

  assert.equal(result.ok, true);
  assert.equal(responseFormatType, "json_object");
});

test("online short JSON response format can be relaxed only by explicit compatibility flag", async (t) => {
  const restore = patchEnv({ ...baseGateway, AI_ONLINE_SHORT_JSON_RELAX_RESPONSE_FORMAT: "1" });
  const origFetch = globalThis.fetch;
  let responseFormatType = "";
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { response_format?: { type?: string } };
    responseFormatType = body.response_format?.type ?? "";
    return new Response(JSON.stringify({ choices: [{ message: { content: "{\"intent\":\"explore\"}" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  t.after(() => {
    globalThis.fetch = origFetch;
    restore();
    resetModelCircuitsForTests();
    resetProviderCircuitsForTests();
  });
  resetModelCircuitsForTests();
  resetProviderCircuitsForTests();

  const result = await executeChatCompletion({
    task: "PLAYER_CONTROL_PREFLIGHT",
    messages: [{ role: "user", content: "观察四周" }],
    ctx: { requestId: "gw-contract-control-json-relaxed", task: "PLAYER_CONTROL_PREFLIGHT" },
    skipCache: true,
  });

  assert.equal(result.ok, true);
  assert.equal(responseFormatType, "");
});

test("control-plane JSON disables provider thinking by default so output budget remains available", async (t) => {
  const restore = patchEnv({ ...baseGateway, AI_ONLINE_SHORT_JSON_DISABLE_THINKING: undefined });
  const origFetch = globalThis.fetch;
  let bodyExtra: Record<string, unknown> = {};
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    bodyExtra = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ choices: [{ message: { content: "{\"intent\":\"explore\"}" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  t.after(() => {
    globalThis.fetch = origFetch;
    restore();
    resetModelCircuitsForTests();
    resetProviderCircuitsForTests();
  });
  resetModelCircuitsForTests();
  resetProviderCircuitsForTests();

  const result = await executeChatCompletion({
    task: "PLAYER_CONTROL_PREFLIGHT",
    messages: [{ role: "user", content: "观察四周" }],
    ctx: { requestId: "gw-contract-control-disable-thinking", task: "PLAYER_CONTROL_PREFLIGHT" },
    skipCache: true,
  });

  assert.equal(result.ok, true);
  assert.equal(bodyExtra.enable_thinking, false);
  assert.deepEqual(bodyExtra.thinking, { type: "disabled" });
});

test("managed PLAYER_CHAT route uses the configured Flash model with thinking disabled", async (t) => {
  const restore = patchEnv({
    ...baseGateway,
    AI_MODEL_MAIN: "deepseek-v4-flash",
    VC_AI_DIRECT_MODEL: undefined,
    VC_AI_DIRECT_PLAYER_MODEL: "deepseek-v4-flash",
    VC_AI_DIRECT_MODEL_MAIN: "deepseek-v4-pro-202606",
    VC_AI_DIRECT_MODEL_CONTROL: "deepseek-v4-pro-202606",
    VC_AI_DIRECT_MODEL_ENHANCE: "deepseek-v4-pro-202606",
    VC_AI_DIRECT_MODEL_REASONER: "deepseek-v4-pro-202606",
    AI_UPSTREAM_MERGE_EXTRA_BODY: "1",
    AI_UPSTREAM_EXTRA_BODY_JSON:
      '{"enable_thinking":true,"thinking":{"type":"enabled"},"reasoning_effort":"max"}',
    AI_PLAYER_CHAT_DISABLE_THINKING: "1",
    AI_PLAYER_CHAT_MERGE_EXTRA_BODY: "1",
    AI_PLAYER_CHAT_EXTRA_BODY_JSON:
      '{"enable_thinking":false,"thinking":{"type":"disabled"}}',
  });
  const origFetch = globalThis.fetch;
  let captured: Record<string, unknown> = {};
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    captured = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(new ReadableStream({ start(controller) { controller.close(); } }), {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  };
  t.after(() => {
    globalThis.fetch = origFetch;
    restore();
    resetModelCircuitsForTests();
    resetProviderCircuitsForTests();
  });

  const result = await executePlayerChatStream({
    messages: [{ role: "user", content: "观察四周" }],
    ctx: { requestId: "gw-contract-split-player", task: "PLAYER_CHAT" },
  });

  assert.equal(result.ok, true);
  assert.equal(captured.model, "deepseek-v4-flash");
  assert.equal(captured.stream, true);
  assert.equal(captured.enable_thinking, false);
  assert.deepEqual(captured.thinking, { type: "disabled" });
  assert.equal("reasoning_effort" in captured, false);
});

test("managed EVAL_JUDGE route uses the configured Pro model with maximum thinking", async (t) => {
  const restore = patchEnv({
    ...baseGateway,
    AI_MODEL_REASONER: "deepseek-v4-pro-202606",
    VC_AI_DIRECT_MODEL: undefined,
    VC_AI_DIRECT_PLAYER_MODEL: "deepseek-v4-flash",
    VC_AI_DIRECT_MODEL_MAIN: "deepseek-v4-pro-202606",
    VC_AI_DIRECT_MODEL_CONTROL: "deepseek-v4-pro-202606",
    VC_AI_DIRECT_MODEL_ENHANCE: "deepseek-v4-pro-202606",
    VC_AI_DIRECT_MODEL_REASONER: "deepseek-v4-pro-202606",
    AI_UPSTREAM_MERGE_EXTRA_BODY: "1",
    AI_UPSTREAM_EXTRA_BODY_JSON:
      '{"enable_thinking":true,"thinking":{"type":"enabled"},"reasoning_effort":"max"}',
    AI_PLAYER_CHAT_DISABLE_THINKING: "1",
    AI_ONLINE_SHORT_JSON_DISABLE_THINKING: "1",
  });
  const origFetch = globalThis.fetch;
  let captured: Record<string, unknown> = {};
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    captured = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({ choices: [{ message: { content: "{\"score\":1}" } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };
  t.after(() => {
    globalThis.fetch = origFetch;
    restore();
    resetModelCircuitsForTests();
    resetProviderCircuitsForTests();
  });

  const result = await executeChatCompletion({
    task: "EVAL_JUDGE",
    messages: [{ role: "user", content: "judge" }],
    ctx: { requestId: "gw-contract-split-judge", task: "EVAL_JUDGE" },
    skipCache: true,
  });

  assert.equal(result.ok, true);
  assert.equal(captured.model, "deepseek-v4-pro-202606");
  assert.equal(captured.max_tokens, undefined);
  assert.equal(captured.enable_thinking, true);
  assert.deepEqual(captured.thinking, { type: "enabled" });
  assert.equal(captured.reasoning_effort, "max");
});

test("executeChatCompletion stops before upstream fetch when caller signal is already aborted", async (t) => {
  const restore = patchEnv(baseGateway);
  const origFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  };
  t.after(() => {
    globalThis.fetch = origFetch;
    restore();
    resetModelCircuitsForTests();
    resetProviderCircuitsForTests();
  });
  resetModelCircuitsForTests();
  resetProviderCircuitsForTests();

  const ac = new AbortController();
  ac.abort();
  const res = await executeChatCompletion({
    task: "INTENT_PARSE",
    messages: [{ role: "user", content: "{}" }],
    ctx: { requestId: "gw-contract-aborted-short-task", task: "INTENT_PARSE" },
    signal: ac.signal,
    skipCache: true,
  });

  assert.equal(res.ok, false);
  assert.equal(res.code, "ABORTED");
  assert.equal(fetchCalled, false);
});

test("NARRATIVE_EXPANSION is non-stream json without a max_tokens cap", async (t) => {
  const restore = patchEnv(baseGateway);
  const origFetch = globalThis.fetch;
  let maxTokens: number | undefined;
  let responseFormatType = "";
  let stream: boolean | undefined;
  let model = "";
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      model?: string;
      max_tokens?: number;
      response_format?: { type?: string };
      stream?: boolean;
    };
    model = body.model ?? "";
    maxTokens = body.max_tokens;
    responseFormatType = body.response_format?.type ?? "";
    stream = body.stream;
    return new Response(JSON.stringify({ choices: [{ message: { content: "{\"narrative\":\"expanded\"}" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  t.after(() => {
    globalThis.fetch = origFetch;
    restore();
    resetModelCircuitsForTests();
    resetProviderCircuitsForTests();
  });
  resetModelCircuitsForTests();
  resetProviderCircuitsForTests();

  const res = await executeChatCompletion({
    task: "NARRATIVE_EXPANSION",
    messages: [{ role: "user", content: "{}" }],
    ctx: { requestId: "gw-contract-narrative-expansion", task: "NARRATIVE_EXPANSION" },
  });

  assert.equal(res.ok, true);
  assert.equal(model, "model-enhance");
  assert.equal(maxTokens, undefined);
  assert.equal(responseFormatType, "json_object");
  assert.equal(stream, false);
});

test("managed test bindings normalize local and production-style base URLs", async () => {
  const restoreA = patchEnv({
    AI_GATEWAY_BASE_URL: "http://127.0.0.1:8080",
    AI_GATEWAY_API_KEY: "x",
    AI_MODEL_MAIN: "m",
    AI_MODEL_CONTROL: "c",
    AI_MODEL_ENHANCE: "e",
    AI_MODEL_REASONER: "r",
  });
  try {
    assert.match(getManagedBindingsForTask("PLAYER_CHAT")[0]?.baseUrl ?? "", /\/v1\/chat\/completions$/);
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
      getManagedBindingsForTask("PLAYER_CHAT")[0]?.baseUrl,
      "https://coolify-prod.example/v1/chat/completions"
    );
  } finally {
    restoreB();
  }
});
