import assert from "node:assert/strict";
import test from "node:test";
import { resilientFetch } from "@/lib/ai/resilience/fetchWithRetry";
import { PLAYER_TURN_TERMINAL_TOOL_NAME } from "@/lib/ai/tools/playerTurnTerminalTool";

function terminalInit(): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "minimax-m3",
      stream: false,
      tools: [
        {
          type: "function",
          function: { name: PLAYER_TURN_TERMINAL_TOOL_NAME, parameters: { type: "object" } },
        },
      ],
      tool_choice: {
        type: "function",
        function: { name: PLAYER_TURN_TERMINAL_TOOL_NAME },
      },
    }),
  };
}

function terminalResponse(): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: {
                  name: PLAYER_TURN_TERMINAL_TOOL_NAME,
                  arguments: '{"is_action_legal":true,"sanity_damage":0,"narrative":"ok","is_death":false}',
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json", "content-length": "999" } }
  );
}

test("resilientFetch projects a successful terminal call before returning", { concurrency: false }, async (t) => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => terminalResponse()) as typeof fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const response = await resilientFetch("https://example.test/v1/chat/completions", terminalInit(), {
    timeoutMs: 1_000,
    maxRetries: 0,
  });
  const parsed = (await response.json()) as { choices: Array<{ message: { content: string } }> };
  assert.match(parsed.choices[0].message.content, /"narrative":"ok"/);
  assert.equal(response.headers.has("content-length"), false);
});

test("prefer mode retries once without tools on a compatibility 400", { concurrency: false }, async (t) => {
  const previousFetch = globalThis.fetch;
  const previousMode = process.env.AI_PLAYER_CHAT_FUNCTION_CALLING_MODE;
  process.env.AI_PLAYER_CHAT_FUNCTION_CALLING_MODE = "prefer";
  const requestBodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_url: URL | RequestInfo, init?: RequestInit) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    if (requestBodies.length === 1) {
      return new Response('{"error":{"message":"tool_choice is not supported"}}', { status: 400 });
    }
    return new Response(
      JSON.stringify({ choices: [{ message: { content: '{"narrative":"fallback"}' }, finish_reason: "stop" }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousMode === undefined) delete process.env.AI_PLAYER_CHAT_FUNCTION_CALLING_MODE;
    else process.env.AI_PLAYER_CHAT_FUNCTION_CALLING_MODE = previousMode;
  });

  const response = await resilientFetch("https://example.test/v1/chat/completions", terminalInit(), {
    timeoutMs: 1_000,
    maxRetries: 0,
  });
  assert.equal(response.status, 200);
  assert.equal(requestBodies.length, 2);
  assert.equal("tools" in requestBodies[1], false);
  assert.equal("tool_choice" in requestBodies[1], false);
  assert.deepEqual(requestBodies[1].response_format, { type: "json_object" });
});

test("prefer mode recognises the Responses API wire shape and rewrites the body with text.format.json_object", { concurrency: false }, async (t) => {
  // Responses API uses the flattened tool_choice shape ({ type, name }) and
  // the json-mode fallback must land in `text.format`, not `response_format`.
  const responsesTerminalInit: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "minimax-m3",
      input: [{ role: "user", content: "继续" }],
      stream: true,
      tools: [
        {
          type: "function",
          name: PLAYER_TURN_TERMINAL_TOOL_NAME,
          description: "submit player turn",
          parameters: { type: "object" },
        },
      ],
      tool_choice: { type: "function", name: PLAYER_TURN_TERMINAL_TOOL_NAME },
    }),
  };

  const previousFetch = globalThis.fetch;
  const previousMode = process.env.AI_PLAYER_CHAT_FUNCTION_CALLING_MODE;
  process.env.AI_PLAYER_CHAT_FUNCTION_CALLING_MODE = "prefer";
  const requestBodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_url: URL | RequestInfo, init?: RequestInit) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    if (requestBodies.length === 1) {
      return new Response('{"error":{"message":"function_call arguments delta is not supported"}}', { status: 400 });
    }
    return new Response(
      JSON.stringify({
        output: [
          { type: "message", role: "assistant", content: [{ type: "output_text", text: '{"narrative":"fallback"}' }] },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousMode === undefined) delete process.env.AI_PLAYER_CHAT_FUNCTION_CALLING_MODE;
    else process.env.AI_PLAYER_CHAT_FUNCTION_CALLING_MODE = previousMode;
  });

  const response = await resilientFetch("https://example.test/v1/responses", responsesTerminalInit, {
    timeoutMs: 1_000,
    maxRetries: 0,
  });
  assert.equal(response.status, 200);
  assert.equal(requestBodies.length, 2);
  const retry = requestBodies[1];
  // tools / tool_choice / parallel_tool_calls removed; text.format.json_object set
  assert.equal("tools" in retry, false);
  assert.equal("tool_choice" in retry, false);
  assert.deepEqual(retry.text, { format: { type: "json_object" } });
  // `response_format` is the Chat Completions field name — must NOT appear on
  // the Responses wire body.
  assert.equal("response_format" in retry, false);
  // input is preserved on the retry
  assert.ok(Array.isArray(retry.input));
});
