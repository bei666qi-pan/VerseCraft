import assert from "node:assert/strict";
import test from "node:test";
import { resilientFetch } from "@/lib/ai/resilience/fetchWithRetry";
import { PLAYER_NARRATIVE_TERMINAL_TOOL_NAME } from "@/lib/ai/tools/playerNarrativeTerminalTool";

function narrativeTerminalInit(): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "minimax-m3",
      stream: false,
      tools: [{
        type: "function",
        function: { name: PLAYER_NARRATIVE_TERMINAL_TOOL_NAME, parameters: { type: "object" } },
      }],
      tool_choice: {
        type: "function",
        function: { name: PLAYER_NARRATIVE_TERMINAL_TOOL_NAME },
      },
    }),
  };
}

function narrativeTerminalResponse(): Response {
  return new Response(JSON.stringify({
    choices: [{
      message: {
        role: "assistant",
        content: null,
        tool_calls: [{
          id: "call_narrative",
          type: "function",
          function: {
            name: PLAYER_NARRATIVE_TERMINAL_TOOL_NAME,
            arguments: '{"narrative":"走廊安静下来。","options":["观察","倾听","后退","询问"],"turn_mode":"decision_required","decision_required":true}',
          },
        }],
      },
      finish_reason: "tool_calls",
    }],
  }), { status: 200, headers: { "content-type": "application/json", "content-length": "999" } });
}

test("resilientFetch projects the narrow narrative terminal call without a second request", { concurrency: false }, async (t) => {
  const previousFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = (async () => {
    callCount += 1;
    return narrativeTerminalResponse();
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const response = await resilientFetch("https://example.test/v1/chat/completions", narrativeTerminalInit(), {
    timeoutMs: 1_000,
    maxRetries: 0,
  });
  const parsed = (await response.json()) as { choices: Array<{ message: { content: string; tool_calls?: unknown } }> };
  assert.match(parsed.choices[0].message.content, /"narrative":"走廊安静下来。"/);
  assert.equal("tool_calls" in parsed.choices[0].message, false);
  assert.equal(response.headers.has("content-length"), false);
  assert.equal(callCount, 1);
});

test("tool incompatibility is surfaced instead of starting a legacy compatibility call", { concurrency: false }, async (t) => {
  const previousFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = (async () => {
    callCount += 1;
    return new Response('{"error":{"message":"tool_choice is not supported"}}', { status: 400 });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const response = await resilientFetch("https://example.test/v1/chat/completions", narrativeTerminalInit(), {
    timeoutMs: 1_000,
    maxRetries: 0,
  });
  assert.equal(response.status, 400);
  assert.equal(callCount, 1);
});
