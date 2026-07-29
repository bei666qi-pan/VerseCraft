import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPlayerTurnJsonFallbackInit,
  normalizePlayerTurnTerminalToolResponse,
  shouldFallbackPlayerTurnTerminalTool,
} from "@/lib/ai/stream/playerTurnTerminalToolResponse";
import { PLAYER_TURN_TERMINAL_TOOL_NAME } from "@/lib/ai/tools/playerTurnTerminalTool";

function terminalInit(stream: boolean): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "deepseek-v4-flash",
      stream,
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

test("non-stream terminal tool arguments become assistant content", async () => {
  const response = new Response(
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
                  arguments: '{"is_action_legal":true,"sanity_damage":0,"narrative":"继续","is_death":false}',
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );

  const normalized = await normalizePlayerTurnTerminalToolResponse(response, terminalInit(false));
  const json = (await normalized.json()) as {
    choices: Array<{ message: { content: string; tool_calls?: unknown }; finish_reason: string }>;
  };
  assert.match(json.choices[0].message.content, /"narrative":"继续"/);
  assert.equal("tool_calls" in json.choices[0].message, false);
  assert.equal(json.choices[0].finish_reason, "stop");
});

test("streamed tool argument fragments are projected onto delta.content", async () => {
  const sse = [
    `data: ${JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "call_1",
                type: "function",
                function: { name: PLAYER_TURN_TERMINAL_TOOL_NAME, arguments: '{"narrative":"' },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    })}`,
    `data: ${JSON.stringify({
      choices: [
        {
          delta: { tool_calls: [{ index: 0, function: { arguments: '走廊"}' } }] },
          finish_reason: "tool_calls",
        },
      ],
    })}`,
    "data: [DONE]",
    "",
  ].join("\n");
  const response = new Response(sse, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });

  const normalized = await normalizePlayerTurnTerminalToolResponse(response, terminalInit(true));
  const text = await normalized.text();
  const frames = text
    .split("\n")
    .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
    .map((line) => JSON.parse(line.slice("data: ".length)) as {
      choices: Array<{ delta: { content?: string; tool_calls?: unknown }; finish_reason: string | null }>;
    });
  assert.equal(frames.length, 2);
  assert.equal(frames[0].choices[0].delta.content, '{"narrative":"');
  assert.equal(frames[1].choices[0].delta.content, '走廊"}');
  assert.equal("tool_calls" in frames[0].choices[0].delta, false);
  assert.equal("tool_calls" in frames[1].choices[0].delta, false);
  assert.equal(frames[1].choices[0].finish_reason, "stop");
});

test("prefer mode recognizes provider tool incompatibility and builds json fallback", async () => {
  const previous = process.env.AI_PLAYER_CHAT_FUNCTION_CALLING_MODE;
  process.env.AI_PLAYER_CHAT_FUNCTION_CALLING_MODE = "prefer";
  try {
    const response = new Response('{"error":{"message":"tool_choice is not supported"}}', { status: 400 });
    const init = terminalInit(true);
    assert.equal(await shouldFallbackPlayerTurnTerminalTool(response, init), true);
    const fallback = buildPlayerTurnJsonFallbackInit(init);
    const payload = JSON.parse(String(fallback.body)) as Record<string, unknown>;
    assert.equal("tools" in payload, false);
    assert.equal("tool_choice" in payload, false);
    assert.deepEqual(payload.response_format, { type: "json_object" });
  } finally {
    if (previous === undefined) delete process.env.AI_PLAYER_CHAT_FUNCTION_CALLING_MODE;
    else process.env.AI_PLAYER_CHAT_FUNCTION_CALLING_MODE = previous;
  }
});

test("required mode never silently downgrades", async () => {
  const previous = process.env.AI_PLAYER_CHAT_FUNCTION_CALLING_MODE;
  process.env.AI_PLAYER_CHAT_FUNCTION_CALLING_MODE = "required";
  try {
    const response = new Response('{"error":{"message":"tool_choice is not supported"}}', { status: 400 });
    assert.equal(await shouldFallbackPlayerTurnTerminalTool(response, terminalInit(true)), false);
  } finally {
    if (previous === undefined) delete process.env.AI_PLAYER_CHAT_FUNCTION_CALLING_MODE;
    else process.env.AI_PLAYER_CHAT_FUNCTION_CALLING_MODE = previous;
  }
});
