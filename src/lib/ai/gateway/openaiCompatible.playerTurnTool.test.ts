import assert from "node:assert/strict";
import test from "node:test";
import { openaiCompatibleGateway } from "@/lib/ai/gateway/openaiCompatible";
import type { NormalizedCompletionRequest } from "@/lib/ai/providers/types";
import { PLAYER_NARRATIVE_TERMINAL_TOOL_NAME } from "@/lib/ai/tools/playerNarrativeTerminalTool";

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

test("PLAYER_CHAT stream defaults to the narrow narrative candidate tool", () => {
  const payload = payloadFor();
  const tools = payload.tools as Array<Record<string, unknown>>;
  const fn = tools[0].function as Record<string, unknown>;
  assert.equal(fn.name, PLAYER_NARRATIVE_TERMINAL_TOOL_NAME);
  assert.equal(typeof fn.parameters, "object");
  assert.deepEqual(payload.tool_choice, {
    type: "function",
    function: { name: PLAYER_NARRATIVE_TERMINAL_TOOL_NAME },
  });
  assert.deepEqual(payload.response_format, { type: "json_object" });
});

test("explicit task tools are never replaced by the player terminal tool", () => {
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
