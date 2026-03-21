// src/lib/ai/router/execute.playerStream.fallback.test.ts
/**
 * Integration: PLAYER_CHAT stream succeeds on second model after first upstream returns 503.
 * Validates multi-vendor fallback without real API keys (global fetch mock).
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
    DEEPSEEK_API_KEY: "ds-test",
    ZHIPU_API_KEY: "zp-test",
    MINIMAX_API_KEY: undefined,
    AI_MAX_RETRIES: "0",
    AI_TIMEOUT_MS: "8000",
    AI_CIRCUIT_FAILURE_THRESHOLD: "99",
  });
  const origFetch = globalThis.fetch;
  let deepseekCalls = 0;
  let zhipuCalls = 0;

  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("api.deepseek.com")) {
      deepseekCalls++;
      return new Response("upstream unavailable", { status: 503 });
    }
    if (url.includes("open.bigmodel.cn")) {
      zhipuCalls++;
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
    }
    return new Response(`unexpected url: ${url}`, { status: 500 });
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
  assert.equal(result.modelId, "glm-5-air");
  assert.equal(deepseekCalls >= 1, true);
  assert.equal(zhipuCalls >= 1, true);
  assert.ok(result.response.body);
});
