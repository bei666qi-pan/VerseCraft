// src/lib/ai/router/execute.playerStream.fallback.test.ts
/**
 * Integration: PLAYER_CHAT stream succeeds on second role after first upstream returns 503.
 */
// These tests stub global fetch with fake hosts; the HTTP/1.1 gateway
// transport (AI_GATEWAY_FORCE_HTTP1) would bypass the stub with real DNS.
process.env.AI_GATEWAY_FORCE_HTTP1 = "0";
import test from "node:test";
import assert from "node:assert/strict";
import { resetProviderCircuitsForTests } from "@/lib/ai/fallback/circuitBreaker";
import { resetModelCircuitsForTests } from "@/lib/ai/fallback/modelCircuit";
import type { ChatMessage } from "@/lib/ai/types/core";
import { executePlayerChatStream } from "@/lib/ai/router/execute";

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
  return () => {
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

test("executePlayerChatStream falls back when primary upstream returns 503", async (t) => {
  const restoreEnv = patchEnv({
    AI_GATEWAY_BASE_URL: "https://gateway.test",
    AI_GATEWAY_API_KEY: "k",
    AI_MODEL_WRITER: "upstream-main",
    AI_MODEL_MAIN: "upstream-main",
    AI_MODEL_CONTROL: "upstream-control",
    AI_MODEL_ENHANCE: "e",
    AI_MODEL_REASONER: "r",
    AI_PLAYER_ROLE_CHAIN: "main,control",
    AI_MAX_RETRIES: "0",
    AI_PLAYER_CHAT_MAX_ROLE_CANDIDATES: "3",
    AI_TIMEOUT_MS: "8000",
    AI_CIRCUIT_FAILURE_THRESHOLD: "99",
  });
  const origFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.includes("gateway.test")) {
      return new Response(`unexpected url: ${url}`, { status: 500 });
    }
    calls++;
    const model = JSON.parse(String(init?.body)).model;
    // Chain: writer → main → control. Writer and main both use upstream-main.
    if (calls <= 2) {
      assert.ok(model === "upstream-main");
      return new Response("upstream unavailable", { status: 503 });
    }
    assert.ok(model === "upstream-control");
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          enc.encode(
            `data: ${JSON.stringify({
              choices: [{ delta: { content: "fragment" }, finish_reason: null }],
            })}\n\n`
          )
        );
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
    restoreEnv();
    resetModelCircuitsForTests();
    resetProviderCircuitsForTests();
  });

  resetModelCircuitsForTests();
  resetProviderCircuitsForTests();

  const messages: ChatMessage[] = [{ role: "user", content: "hello" }];
  const result = await executePlayerChatStream({
    messages,
    ctx: { requestId: "e2e-fallback", task: "PLAYER_CHAT", userId: null },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.logicalRole, "control");
  assert.equal(calls, 3);
  assert.ok(result.response.body);
});

test("executePlayerChatStream falls back when primary upstream fetch times out", async (t) => {
  const restoreEnv = patchEnv({
    AI_GATEWAY_BASE_URL: "https://gateway.test",
    AI_GATEWAY_API_KEY: "k",
    AI_MODEL_WRITER: "upstream-main",
    AI_MODEL_MAIN: "upstream-main",
    AI_MODEL_CONTROL: "upstream-control",
    AI_MODEL_ENHANCE: "e",
    AI_MODEL_REASONER: "r",
    AI_PLAYER_ROLE_CHAIN: "main,control",
    AI_MAX_RETRIES: "0",
    AI_PLAYER_CHAT_AGGRESSIVE_FAILOVER: "1",
    AI_PLAYER_CHAT_MAX_ROLE_CANDIDATES: "3",
    AI_CIRCUIT_FAILURE_THRESHOLD: "99",
  });
  const origFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.includes("gateway.test")) {
      return new Response(`unexpected url: ${url}`, { status: 500 });
    }
    calls++;
    const body = JSON.parse(String(init?.body)) as { model?: string };
    const model = body.model;
    // Chain: writer → main → control. First two time out, third succeeds.
    if (calls <= 2) {
      assert.equal(model, "upstream-main");
      const signal = init?.signal;
      return await new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener(
          "abort",
          () => {
            const err = new Error("The operation was aborted.");
            err.name = "AbortError";
            reject(err);
          },
          { once: true }
        );
      });
    }
    assert.equal(model, "upstream-control");
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          enc.encode(
            `data: ${JSON.stringify({
              choices: [{ delta: { content: "fallback fragment" }, finish_reason: null }],
            })}\n\n`
          )
        );
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
    restoreEnv();
    resetModelCircuitsForTests();
    resetProviderCircuitsForTests();
  });

  resetModelCircuitsForTests();
  resetProviderCircuitsForTests();

  const messages: ChatMessage[] = [{ role: "user", content: "hello" }];
  const result = await executePlayerChatStream({
    messages,
    ctx: { requestId: "e2e-fallback-timeout", task: "PLAYER_CHAT", userId: null },
    timeoutMs: 1,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.logicalRole, "control");
  assert.equal(calls, 3);
  assert.equal(result.httpAttempts[0]?.failureKind, "TIMEOUT");
  assert.ok(result.response.body);
});
