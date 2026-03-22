// src/lib/ai/router/execute.playerStream.fallback.test.ts
/**
 * Integration: PLAYER_CHAT stream succeeds on second role after first upstream returns 503.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { resetProviderCircuitsForTests } from "@/lib/ai/fallback/circuitBreaker";
import { resetModelCircuitsForTests } from "@/lib/ai/fallback/modelCircuit";
import type { ChatMessage } from "@/lib/ai/types/core";
import { executePlayerChatStream } from "@/lib/ai/router/execute";

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

test("executePlayerChatStream falls back when primary upstream returns 503", async (t) => {
  const restoreEnv = patchEnv({
    AI_GATEWAY_BASE_URL: "https://gateway.test",
    AI_GATEWAY_API_KEY: "k",
    AI_MODEL_MAIN: "upstream-main",
    AI_MODEL_CONTROL: "upstream-control",
    AI_MODEL_ENHANCE: "e",
    AI_MODEL_REASONER: "r",
    AI_PLAYER_ROLE_CHAIN: "main,control",
    AI_MAX_RETRIES: "0",
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
    if (calls === 1) {
      assert.ok(JSON.parse(String(init?.body)).model === "upstream-main");
      return new Response("upstream unavailable", { status: 503 });
    }
    assert.ok(JSON.parse(String(init?.body)).model === "upstream-control");
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
  assert.equal(calls, 2);
  assert.ok(result.response.body);
});
