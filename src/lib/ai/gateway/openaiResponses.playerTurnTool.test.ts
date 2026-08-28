// src/lib/ai/gateway/openaiResponses.playerTurnTool.test.ts
//
// Contract tests for the Responses channel under PLAYER_CHAT strict
// function mode. Mirrors openaiCompatible.playerTurnTool.test.ts so both
// transports gate `submit_player_turn` on the same condition
// (`shouldUsePlayerTurnTerminalTool`).
//
// The Responses channel is now allowed to use the terminal tool:
//   - tools: [{ type, name, description, parameters }]  (Responses flattens
//     the Chat-Completions-style `function: { name, ... }` wrapper)
//   - tool_choice: { type: "function", name: "submit_player_turn" }
//   - text: deleted (strict function tool and text.format.json_schema are
//     mutually exclusive — AGENTS.md §3.2.2)
//
// See AGENTS.md §3.2.6 and the change `open-responses-streaming-for-player-turn`.

import assert from "node:assert/strict";
import test from "node:test";
import { openaiResponsesGateway } from "@/lib/ai/gateway/openaiResponses";
import type { NormalizedCompletionRequest } from "@/lib/ai/providers/types";
import { PLAYER_TURN_TERMINAL_TOOL_NAME } from "@/lib/ai/tools/playerTurnTerminalTool";

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

function withMode(mode: string | undefined, run: () => void): void {
  const previous = process.env.AI_PLAYER_CHAT_FUNCTION_CALLING_MODE;
  if (mode === undefined) delete process.env.AI_PLAYER_CHAT_FUNCTION_CALLING_MODE;
  else process.env.AI_PLAYER_CHAT_FUNCTION_CALLING_MODE = mode;
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env.AI_PLAYER_CHAT_FUNCTION_CALLING_MODE;
    else process.env.AI_PLAYER_CHAT_FUNCTION_CALLING_MODE = previous;
  }
}

test("PLAYER_CHAT stream on Responses appends submit_player_turn and pins tool_choice, and drops the text block", () => {
  withMode(undefined, () => {
    const payload = payloadFor();
    const tools = payload.tools as Array<Record<string, unknown>>;
    assert.equal(tools.length, 1);

    // Responses flattens the function wrapper: name/description/parameters
    // sit on the same object as `type`, not under `function: { ... }`.
    assert.equal(tools[0]?.type, "function");
    assert.equal(tools[0]?.name, PLAYER_TURN_TERMINAL_TOOL_NAME);
    assert.equal(typeof tools[0]?.description, "string");
    assert.equal(typeof tools[0]?.parameters, "object");

    // tool_choice is the Responses wire shape: { type, name } (no `function`).
    assert.deepEqual(payload.tool_choice, {
      type: "function",
      name: PLAYER_TURN_TERMINAL_TOOL_NAME,
    });

    // Strict function tool and text.format.json_schema are mutually exclusive
    // in the same request (AGENTS.md §3.2.2). With strict function enabled,
    // the text block must be absent even though body.responseFormatJsonObject
    // was true on the call.
    assert.equal("text" in payload, false, "text block must be dropped under strict function mode");
  });
});

test("off mode on Responses does not append the terminal tool and keeps the json_schema path", () => {
  withMode("off", () => {
    const payload = payloadFor();
    assert.equal("tools" in payload, false);
    assert.equal("tool_choice" in payload, false);
    // Without strict function mode the json_object downgrade path stays in
    // effect: openaiResponses.ts:120-152 emits a minimal json_schema.
    assert.ok(payload.text, "text block should be present when strict function is off");
  });
});

test("Responses passes through caller-supplied tools instead of replacing them with the terminal tool", () => {
  withMode("required", () => {
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
    // Pass-through shape: name/description/parameters flattened, function wrapper removed.
    assert.equal(tools.length, 1);
    assert.equal(tools[0]?.name, "offline_tool");
    assert.equal(tools[0]?.description, "test");
    // "auto" is forwarded as a string for caller-supplied toolChoice.
    assert.equal(payload.tool_choice, "auto");
    assert.equal("text" in payload, false, "caller tools must not coexist with text.format.json_schema");
  });
});
