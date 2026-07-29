import assert from "node:assert/strict";
import test from "node:test";
import { openaiCompatibleGateway } from "@/lib/ai/gateway/openaiCompatible";
import type { NormalizedCompletionRequest } from "@/lib/ai/providers/types";
import { PLAYER_TURN_TERMINAL_TOOL_NAME } from "@/lib/ai/tools/playerTurnTerminalTool";

function body(partial: Partial<NormalizedCompletionRequest> = {}): NormalizedCompletionRequest {
  return {
    modelApiName: "deepseek-v4-flash",
    messages: [{ role: "user", content: "继续" }],
    stream: true,
    maxTokens: 896,
    responseFormatJsonObject: true,
    ...partial,
  };
}

function payloadFor(partial?: Partial<NormalizedCompletionRequest>): Record<string, unknown> {
  const init = openaiCompatibleGateway.buildInit("secret", body(partial));
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

test("PLAYER_CHAT stream defaults to one forced terminal function call", () => {
  withMode(undefined, () => {
    const payload = payloadFor();
    const tools = payload.tools as Array<Record<string, unknown>>;
    const fn = tools[0].function as Record<string, unknown>;
    assert.equal(fn.name, PLAYER_TURN_TERMINAL_TOOL_NAME);
    assert.equal(typeof fn.parameters, "object");
    assert.deepEqual(payload.tool_choice, {
      type: "function",
      function: { name: PLAYER_TURN_TERMINAL_TOOL_NAME },
    });
    assert.equal("response_format" in payload, false);
  });
});

test("off mode preserves the previous json_object transport", () => {
  withMode("off", () => {
    const payload = payloadFor();
    assert.equal("tools" in payload, false);
    assert.equal("tool_choice" in payload, false);
    assert.deepEqual(payload.response_format, { type: "json_object" });
  });
});

test("explicit task tools are never replaced by the player terminal tool", () => {
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
    assert.deepEqual(payload.tools, [explicitTool]);
    assert.equal(payload.tool_choice, "auto");
  });
});
