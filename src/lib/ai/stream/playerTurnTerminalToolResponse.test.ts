import assert from "node:assert/strict";
import test from "node:test";
import { normalizePlayerTurnTerminalToolResponse } from "@/lib/ai/stream/playerTurnTerminalToolResponse";
import { PLAYER_NARRATIVE_TERMINAL_TOOL_NAME } from "@/lib/ai/tools/playerNarrativeTerminalTool";

function terminalInit(stream: boolean): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "minimax-m3",
      stream,
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

test("non-stream narrative tool arguments become assistant content", async () => {
  const response = new Response(JSON.stringify({
    choices: [{
      message: {
        role: "assistant",
        content: null,
        tool_calls: [{
          id: "call_1",
          type: "function",
          function: {
            name: PLAYER_NARRATIVE_TERMINAL_TOOL_NAME,
            arguments: '{"narrative":"继续","options":["一","二","三","四"],"turn_mode":"decision_required","decision_required":true}',
          },
        }],
      },
      finish_reason: "tool_calls",
    }],
  }), { status: 200, headers: { "content-type": "application/json" } });

  const normalized = await normalizePlayerTurnTerminalToolResponse(response, terminalInit(false));
  const json = (await normalized.json()) as {
    choices: Array<{ message: { content: string; tool_calls?: unknown }; finish_reason: string }>;
  };
  assert.match(json.choices[0].message.content, /"narrative":"继续"/);
  assert.equal("tool_calls" in json.choices[0].message, false);
  assert.equal(json.choices[0].finish_reason, "stop");
});

test("streamed narrative arguments are projected onto delta.content", async () => {
  const sse = [
    `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: PLAYER_NARRATIVE_TERMINAL_TOOL_NAME, arguments: '{"narrative":"' } }] }, finish_reason: null }] })}`,
    `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '走廊"}' } }] }, finish_reason: "tool_calls" }] })}`,
    "data: [DONE]",
    "",
  ].join("\n");
  const response = new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } });

  const normalized = await normalizePlayerTurnTerminalToolResponse(response, terminalInit(true));
  const text = await normalized.text();
  const frames = text
    .split("\n")
    .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
    .map((line) => JSON.parse(line.slice("data: ".length)) as {
      choices: Array<{ delta: { content?: string; tool_calls?: unknown }; finish_reason: string | null }>;
    });
  assert.equal(frames[0].choices[0].delta.content, '{"narrative":"');
  assert.equal(frames[1].choices[0].delta.content, '走廊"}');
  assert.equal("tool_calls" in frames[0].choices[0].delta, false);
  assert.equal(frames[1].choices[0].finish_reason, "stop");
});
