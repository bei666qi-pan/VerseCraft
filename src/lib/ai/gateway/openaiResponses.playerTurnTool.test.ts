// src/lib/ai/gateway/openaiResponses.playerTurnTool.test.ts
//
// Contract tests for the Responses channel under PLAYER_CHAT strict
// function mode. Mirrors openaiCompatible.playerTurnTool.test.ts so both
// transports gate `submit_narrative` on the same condition.
//
// The Responses channel is now allowed to use the terminal tool:
//   - tools: [{ type, name, description, parameters }]  (Responses flattens
//     the Chat-Completions-style `function: { name, ... }` wrapper)
//   - tool_choice: { type: "function", name: "submit_narrative" }
//   - text: deleted (strict function tool and text.format.json_schema are
//     mutually exclusive — AGENTS.md §3.2.2)
//
// See AGENTS.md §3.2.6 and the change `open-responses-streaming-for-player-turn`.

import assert from "node:assert/strict";
import test from "node:test";
import { openaiResponsesGateway } from "@/lib/ai/gateway/openaiResponses";
import type { NormalizedCompletionRequest } from "@/lib/ai/providers/types";
import { PLAYER_NARRATIVE_TERMINAL_TOOL_NAME } from "@/lib/ai/tools/playerNarrativeTerminalTool";

function body(partial: Partial<NormalizedCompletionRequest> = {}): NormalizedCompletionRequest {
  return {
    modelApiName: "minimax-m3",
    messages: [{ role: "user", content: "继续" }],
    stream: true,
    maxTokens: 896,
    responseFormatJsonObject: true,
    ...partial,
  };
}

function payloadFor(partial?: Partial<NormalizedCompletionRequest>): Record<string, unknown> {
  const init = openaiResponsesGateway.buildInit("secret", body(partial));
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

test("PLAYER_CHAT stream on Responses defaults to the narrow narrative candidate tool", () => {
  const payload = payloadFor();
  const tools = payload.tools as Array<Record<string, unknown>>;
  assert.equal(tools.length, 1);

  // Responses flattens the function wrapper: name/description/parameters
  // sit on the same object as `type`, not under `function: { ... }`.
  assert.equal(tools[0]?.type, "function");
  assert.equal(tools[0]?.name, PLAYER_NARRATIVE_TERMINAL_TOOL_NAME);
  assert.equal(typeof tools[0]?.description, "string");
  assert.equal(typeof tools[0]?.parameters, "object");

  // tool_choice is the Responses wire shape: { type, name } (no `function`).
  assert.deepEqual(payload.tool_choice, {
    type: "function",
    name: PLAYER_NARRATIVE_TERMINAL_TOOL_NAME,
  });

  // Strict function tool and text.format.json_schema are mutually exclusive.
  assert.equal("text" in payload, false, "text block must be dropped under strict function mode");
});

test("Responses passes through caller-supplied tools instead of replacing them with the terminal tool", () => {
  const explicitTool = {
    type: "function" as const,
    function: {
      name: "offline_tool",
      description: "test",
      parameters: { type: "object", properties: {} },
    },
  };
  const payload = payloadFor({ tools: [explicitTool], toolChoice: "auto" });
  const tools = payload.tools as Array<Record<string, unknown>>;
  assert.equal(tools.length, 1);
  assert.equal(tools[0]?.name, "offline_tool");
  assert.equal(tools[0]?.description, "test");
  assert.equal(payload.tool_choice, "auto");
  assert.equal("text" in payload, false, "caller tools must not coexist with text.format.json_schema");
});
