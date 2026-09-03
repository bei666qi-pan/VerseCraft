import test from "node:test";
import assert from "node:assert/strict";
import { openaiCompatibleGateway } from "@/lib/ai/gateway/openaiCompatible";
import { openaiResponsesGateway } from "@/lib/ai/gateway/openaiResponses";
import { getProviderFactory } from "@/lib/ai/providers/index";
import { PLAYER_NARRATIVE_TERMINAL_TOOL_NAME } from "@/lib/ai/tools/playerNarrativeTerminalTool";

test("getProviderFactory routes openai_responses transport to openaiResponsesGateway", () => {
  assert.strictEqual(getProviderFactory("openai_responses"), openaiResponsesGateway);
});

test("getProviderFactory routes openai_compatible / ark_multimodal / mock / undefined to openaiCompatibleGateway", () => {
  for (const transport of ["openai_compatible", "ark_multimodal", "mock", undefined] as const) {
    assert.strictEqual(
      getProviderFactory(transport),
      openaiCompatibleGateway,
      `transport=${String(transport)}`,
    );
  }
});

test("openaiResponsesGateway wires submit_narrative into a Responses-flavored payload and drops text", () => {
  // End-to-end snapshot: same narrow Writer decision that
  // `openaiCompatibleGateway` uses, but rendered in Responses wire shape
  // (flattened `tools`, `tool_choice: { type, name }`, no `messages`).
  const init = openaiResponsesGateway.buildInit("k", {
    modelApiName: "minimax-m3",
    messages: [{ role: "user", content: "继续" }],
    stream: true,
    maxTokens: 10,
    responseFormatJsonObject: true,
  });
  const body = JSON.parse(String(init.body)) as Record<string, unknown> & {
    tools?: Array<Record<string, unknown>>;
    tool_choice?: { type?: string; name?: string };
  };
  assert.equal(body.model, "minimax-m3");
  assert.equal(body.stream, true);
  // Responses wire: input (not messages), text absent, tools/tool_choice present
  assert.ok(Array.isArray(body.input));
  assert.equal("text" in body, false);
  assert.equal(body.tools?.length, 1);
  assert.equal(body.tools?.[0]?.name, PLAYER_NARRATIVE_TERMINAL_TOOL_NAME);
  assert.deepEqual(body.tool_choice, { type: "function", name: PLAYER_NARRATIVE_TERMINAL_TOOL_NAME });
});

test("openaiCompatibleGateway sets Authorization and json_object when requested", () => {
  const init = openaiCompatibleGateway.buildInit("k", {
    modelApiName: "vc-main-upstream",
    messages: [{ role: "user", content: "hi" }],
    stream: false,
    maxTokens: 10,
    responseFormatJsonObject: true,
    streamIncludeUsage: false,
  });
  assert.equal(init.method, "POST");
  const body = JSON.parse(String(init.body)) as { model: string; response_format?: { type: string } };
  assert.equal(body.model, "vc-main-upstream");
  assert.equal(body.response_format?.type, "json_object");
  assert.equal("max_tokens" in body, false);
});

test("openaiCompatibleGateway enforces MiniMax output budget with the official completion field", () => {
  const init = openaiCompatibleGateway.buildInit("k", {
    modelApiName: "MiniMax-M3",
    messages: [{ role: "user", content: "hi" }],
    stream: true,
    maxTokens: 2304,
    extraBody: { max_completion_tokens: 9999 },
  });
  const body = JSON.parse(String(init.body)) as {
    max_tokens?: number;
    max_completion_tokens?: number;
  };
  assert.equal(body.max_tokens, undefined);
  assert.equal(body.max_completion_tokens, 2048);

  const shortInit = openaiCompatibleGateway.buildInit("k", {
    modelApiName: "minimax-m3",
    messages: [{ role: "user", content: "classify" }],
    stream: false,
    maxTokens: 192,
  });
  const shortBody = JSON.parse(String(shortInit.body)) as { max_completion_tokens?: number };
  assert.equal(shortBody.max_completion_tokens, 192);
});

test("openaiCompatibleGateway enables stream_options when streaming", () => {
  const init = openaiCompatibleGateway.buildInit("k", {
    modelApiName: "m",
    messages: [{ role: "user", content: "x" }],
    stream: true,
    maxTokens: 8,
    responseFormatJsonObject: false,
    streamIncludeUsage: true,
  });
  const body = JSON.parse(String(init.body)) as { stream_options?: { include_usage: boolean } };
  assert.equal(body.stream_options?.include_usage, true);
});

test("openaiCompatibleGateway shallow-merges extraBody without overriding reserved keys", () => {
  const init = openaiCompatibleGateway.buildInit("k", {
    modelApiName: "m",
    messages: [{ role: "user", content: "x" }],
    stream: false,
    maxTokens: 8,
    extraBody: {
      user: "versecraft-test",
      model: "evil-override",
      messages: [{ role: "system", content: "nope" }],
    },
  });
  const body = JSON.parse(String(init.body)) as {
    model: string;
    messages: unknown[];
    user?: string;
  };
  assert.equal(body.model, "m");
  assert.equal(body.messages.length, 1);
  assert.equal(body.user, "versecraft-test");
});

test("openaiCompatibleGateway does not derive transport headers from deprecated direct-session env", () => {
  const previous = process.env.VC_AI_DIRECT_SOURCE;
  process.env.VC_AI_DIRECT_SOURCE = "codex-deepseek";
  try {
    const init = openaiCompatibleGateway.buildInit("k", {
      modelApiName: "deepseek-v4-pro-202606",
      messages: [{ role: "user", content: "hi" }],
      stream: false,
      maxTokens: 10,
    });
    assert.equal(new Headers(init.headers).get("x-deepseek-meter-source"), null);
  } finally {
    if (previous === undefined) delete process.env.VC_AI_DIRECT_SOURCE;
    else process.env.VC_AI_DIRECT_SOURCE = previous;
  }
});
